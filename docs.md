# Creatives App: документация проекта

Этот документ описывает проект так, чтобы его можно было отправить разработчику или ИИ без истории переписки. В нем есть назначение продукта, текущая архитектура, пользовательский флоу, контракты данных, API, важные решения и ограничения.

## 1. Зачем нужен проект

Creatives App - это MVP-инструмент для генерации и ручного редактирования рекламных креативов на основе одной статичной картинки.

Главная идея:

1. Пользователь загружает готовый рекламный креатив как картинку.
2. AI удаляет весь видимый текст и возвращает чистый фон.
3. AI извлекает текстовый слой оригинального креатива в JSON: блоки, координаты, размеры, стили.
4. Пользователь вручную правит распознанный layout в редакторе.
5. Пользователь может создать новый полный text layer: вставить новый текст или импортировать текст из другого креатива.
6. AI адаптирует этот новый copy/content под текущий визуальный layout и возвращает полный `LayoutResult`.
7. AI генерирует обычные вариации текста не как новый HTML, а как патчи `{ blockId, text }` внутри активного text layer.
8. Приложение применяет патчи к текущему selected creative layout и показывает вариации как карточки.
9. Пользователь может сгенерировать похожие фоны внутри активного text layer и посмотреть его base/variations на новых фонах.
10. Выбранные карточки можно скачать в PNG или ZIP.

Ключевой принцип: источник правды - не сгенерированный HTML и не финальная картинка, а структурированный editable layout:

```txt
background image(s)
  +
text layer layout JSON
  +
copy variation patches
  =
rendered creative cards
```

Это важно не ломать. Именно разделение фона, text layers и copy-патчей делает проект управляемым.

## 2. Текущий стек

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- OpenAI SDK
- `html-to-image` для client-side PNG export
- `jszip` для скачивания нескольких PNG одним ZIP

Важно: в `AGENTS.md` есть правило, что это не "обычный" Next.js из старых знаний. Перед изменением Next-specific API нужно читать локальные доки в:

```txt
node_modules/next/dist/docs/
```

## 3. Структура проекта

```txt
.
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── docs.md
├── next.config.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── tsconfig.json
└── src
    ├── app
    │   ├── api
    │   │   ├── create-text-layer
    │   │   │   └── route.ts
    │   │   ├── extract-layout
    │   │   │   └── route.ts
    │   │   ├── generate-background-variant
    │   │   │   └── route.ts
    │   │   ├── generate-copy-variations
    │   │   │   └── route.ts
    │   │   ├── generate-variations
    │   │   │   └── route.ts
    │   │   └── remove-text
    │   │       └── route.ts
    │   ├── globals.css
    │   ├── layout.tsx
    │   └── page.tsx
    └── modules
        └── creative-workspace
            ├── CreativeWorkspacePage.tsx
            ├── components
            │   ├── AnalyzeCreativeLoader.tsx
            │   ├── AttainifyWatermark.tsx
            │   ├── CopyVariationsPanel.tsx
            │   ├── CreateTextLayerModal.tsx
            │   ├── CreativeCanvas.tsx
            │   ├── EditorPanel.tsx
            │   ├── NumberField.tsx
            │   ├── UploadCreativePanel.tsx
            │   └── VariationSettingsModal.tsx
            ├── types.ts
            └── utils
                ├── api.ts
                ├── dom-export.ts
                ├── image.ts
                ├── layout.ts
                ├── render.ts
                └── watermark.ts
```

Главные файлы:

- `src/app/page.tsx` - тонкий route entrypoint, экспортирует workspace page.
- `src/modules/creative-workspace/CreativeWorkspacePage.tsx` - основной client container, state management и пользовательский флоу.
- `src/modules/creative-workspace/components/*` - UI-компоненты editor/canvas/modals/cards/export panel.
- `src/modules/creative-workspace/utils/*` - shared helpers для layout patches, fit, image sizing, DOM export и style parsing.
- `src/modules/creative-workspace/types.ts` - frontend data contracts.
- `src/app/api/remove-text/route.ts` - удаление текста с картинки и сохранение чистого фона.
- `src/app/api/extract-layout/route.ts` - извлечение текстового layout из оригинального креатива.
- `src/app/api/create-text-layer/route.ts` - создание полного нового text layer из pasted text или другого креатива.
- `src/app/api/generate-copy-variations/route.ts` - генерация текстовых патчей для hook/CTA/body.
- `src/app/api/generate-background-variant/route.ts` - генерация похожего text-free фона.
- `src/app/api/generate-variations/route.ts` - старый legacy endpoint для HTML-вариаций; текущий UI его не использует.

## 4. Основной пользовательский флоу

### 4.1 Build Creative

Пользователь загружает картинку и нажимает `Build Creative`.

Frontend параллельно запускает:

```txt
POST /api/remove-text
POST /api/extract-layout
```

Это сделано через `Promise.all`, чтобы не было промежуточного состояния, где показывается фон без текста, но layout еще не готов.

`remove-text` возвращает чистый фон. `extract-layout` возвращает текстовые блоки. После завершения обоих запросов сразу открывается редактор.

### 4.2 Редактирование layout

Пользователь видит чистый фон и поверх него абсолютные текстовые блоки.

В редакторе можно:

- выбрать блок;
- добавить watermark Attainify;
- изменить текст;
- изменить inline span, если он есть;
- двигать блок мышкой прямо на canvas;
- двигать блок вверх/вниз/влево/вправо через nudge controls;
- центрировать блок горизонтально;
- центрировать строку;
- менять `x`, `y`, `width`, `height`;
- менять `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing`, `color`;
- менять `otherStyles`;
- удалить блок.

Watermark рендерится через обычный layout block. Если block имеет `role: "logo"` или его текст нормализуется в `Attainify`, frontend вместо обычного текста рендерит `AttainifyWatermark`: inline SVG logo + название. SVG наследует `currentColor`, поэтому цвет берется из `TextBlock.color`; размер логотипа пропорционален `fontSize`. Позиция, width/height, fontWeight, zIndex и `otherStyles` остаются от исходного блока. Если AI извлек только текст `Attainify`, renderer автоматически подменит его на watermark. Если такого блока нет, пользователь может добавить watermark кнопкой `Add watermark` в editor panel.

`Done Editing` фиксирует изменения. Если редактируется конкретная variation card, обновляется только она, а не все вариации сразу.

### 4.3 Создание нового text layer

Пользователь может нажать `Create text layer`, если хочет не маленькую hook/CTA/body variation, а полный новый текстовый слой на том же визуальном шаблоне.

Есть два источника:

- `manual` - пользователь вставляет новый текст;
- `creative-import` - пользователь загружает другой креатив, из которого нужно взять видимый текст.

Frontend отправляет текущий selected creative layout из редактора как template. Если пользователь выбрал generated background, этот background переносится в новый text layer как его selected/original visual context.

```txt
POST /api/create-text-layer
```

AI возвращает полный `LayoutResult`, а не patches. Новый слой сохраняется как отдельный `TextLayer`:

- свой `baseLayout`;
- свой `copyResult`;
- свой `backgroundVariants`;
- свой `selectedVariationKey`;
- свой `selectedDownloadKeys`.

После создания приложение переключается на новую вкладку text layer. `Original copy` остается первой постоянной вкладкой, к ней можно вернуться.

Важно: новый text layer - это новая base-версия креатива. Это не обычная `CopyVariation`.

### 4.4 Генерация copy variations

Пользователь выбирает, сколько нужно вариаций:

- hook;
- CTA;
- body.

Для hook есть режим:

- `light` - легкая вариация, поменять 1-3 значимых слова и сохранить смысл;
- `medium` - сохранить боль/желание, но поменять подачу или механизм;
- `strong` - поменять угол, структуру и эмоциональный триггер.

Пользователь также может добавить свободный prompt/instruction для генерации copy. Он используется как дополнительное направление для hooks/CTA/body, но не может менять главный контракт: AI все равно возвращает только text patches и не имеет права менять layout/style поля.

Frontend отправляет текущий selected creative layout в:

```txt
POST /api/generate-copy-variations
```

Важно: перед генерацией фиксируются ручные правки. Если выбрана variation card или карточка на generated background, обычная генерация hook/CTA/body идет именно от этого selected creative layout.

AI возвращает только патчи:

```json
{
  "blockId": "headline",
  "text": "NEW HOOK TEXT"
}
```

AI не имеет права менять координаты, размеры, шрифты, цвета, z-index или `otherStyles`.

После ответа frontend:

1. клонирует текущий selected creative layout;
2. применяет патчи;
3. запускает локальный `fitBlockText`;
4. сохраняет каждую вариацию как отдельный layout snapshot;
5. добавляет новые вариации к уже существующим карточкам той же роли внутри активного text layer, не заменяя старые;
6. показывает вариации карточками.

Если пользователь генерирует еще hooks/CTA/body после первой пачки, новые item ids перенумеровываются относительно уже существующих (`hook-6`, `hook-7`, etc.), чтобы не конфликтовать с прежними карточками. Существующие export selections сохраняются; новые generated cards добавляются в export selection по умолчанию.

### 4.5 Выбор и ручная правка variation card

Под каждой карточкой есть `Select`.

После выбора:

- карточка загружается в основной редактор;
- пользователь может поправить любой блок;
- `Done Editing` обновляет layout snapshot только выбранной карточки.

Это важно: если пользователь изменил hook в `hook-2`, остальные hook/body/CTA карточки не должны измениться.

### 4.6 Генерация background variants

Пользователь может сгенерировать похожий фон в режиме:

- `light`;
- `medium`;
- `strong`.

Пользователь также может добавить свободный prompt/instruction для background generation. Он используется как дополнительное visual direction, но не может отменять запрет на текст, точный canvas size и сохранение text-safe areas.

Запрос:

```txt
POST /api/generate-background-variant
```

Endpoint отправляет в image model две картинки и JSON текущего selected layout:

1. selected clean background без текста;
2. original creative с текстом.
3. template layout текущего selected creative для text-safe boxes.

Selected clean background нужен как visual base. Original creative и template layout нужны, чтобы модель понимала text-safe zones и не делала там визуальный шум.

UI не подменяет фон через dropdown. Новый фон отображается как отдельная секция карточек:

```txt
Original background
Background variant 1
Background variant 2
```

В каждой секции показываются base creative и copy variations активного text layer, но на другом фоне.

Неудачную generated copy variation можно удалить через карточку вариации. Удаление применяется к самой copy variation внутри активного text layer, поэтому карточка исчезает из всех background sections этого layer, а ее export keys убираются из выбранных скачиваний. Original creative удалить нельзя.

### 4.7 Export PNG

У каждой карточки есть checkbox `Export`.

Кнопка `Download selected PNG`:

- если выбрана 1 карточка - скачивает один PNG;
- если выбрано несколько - собирает ZIP через `jszip`.

Export key scoped внутри активного text layer и включает фон, роль и id вариации:

```txt
backgroundId-role-id
```

Примеры:

```txt
original-hook-hook-1
background-123-medium-body-body-2
```

PNG export делается через скрытые full-size DOM-ноды и `html-to-image`. Это удобно для MVP, но может быть медленно: много больших PNG могут собираться пару минут в браузере.

## 5. Core data model

### 5.1 LayoutResult

```ts
type LayoutResult = {
  globalStyles: string
  blocks: TextBlock[]
}
```

`globalStyles` в основном нужен для шрифтов и общих CSS-объявлений.

### 5.2 TextBlock

```ts
type TextBlock = {
  id: string
  role: "hook" | "body" | "cta" | "badge" | "price" | "disclaimer" | "logo" | "other"
  text: string
  spans: TextSpan[] | null
  x: number
  y: number
  width: number
  height: number
  fontFamily: string
  fontSize: number
  lineHeight: number
  fontWeight: number
  letterSpacing: number
  color: string
  align: "left" | "center" | "right"
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize"
  zIndex: number
  otherStyles: string
}
```

Блоки рендерятся через `position: absolute`.

Смысл `role`:

- `hook` - главный крючок/headline;
- `cta` - призыв к действию;
- `body` - все остальное содержательное тело креатива;
- остальные роли нужны для дополнительных элементов.

Для body variation AI может изменить несколько body-блоков за одну вариацию. Например: subheadline + proof + time promise.

### 5.3 TextSpan

```ts
type TextSpan = {
  id: string
  text: string
  fontSize: number
  fontWeight: number
  letterSpacing: number
  color: string
}
```

Spans - это один уровень inline-вложенности внутри логического блока.

Правила:

- Если весь блок имеет один стиль, `spans` должен быть `null`.
- Если внутри одной логической строки есть разные цвета/веса, использовать spans.
- Не надо делить логический блок на разные блоки только из-за цвета.

Пример:

```txt
Week 1: Regain focus.
```

Это один блок с двумя spans, а не два отдельных блока.

### 5.4 otherStyles

`otherStyles` - строка CSS declarations для дополнительных декоративных стилей.

Примеры:

```css
text-shadow: 0 2px 4px rgba(0,0,0,.25);
border: 2px solid #fff; border-radius: 6px; padding: 4px 8px;
```

Подходит для:

- shadow;
- border;
- background fill;
- border radius;
- padding;
- opacity;
- декоративных CSS-свойств.

Не должен использоваться для основных layout/style полей, которые уже есть в `TextBlock`: `position`, `left`, `top`, `width`, `height`, `font-size`, `color`, `z-index` и т.д. Frontend фильтрует опасные и конфликтующие свойства.

### 5.5 CopyVariation

```ts
type CopyVariation = {
  id: string
  patches: Array<{
    blockId: string
    text: string
  }>
  layout?: LayoutResult
}
```

`patches` приходят от AI. `layout` материализуется на frontend после применения патчей.

Когда пользователь редактирует выбранную вариацию, обновляется ее `layout`, а не общий source layout.

### 5.6 TextLayer

```ts
type TextLayer = {
  id: string
  name: string
  source: "original" | "manual" | "creative-import"
  baseLayout: LayoutResult
  copyResult: CopyVariationsResult | null
  backgroundVariants: BackgroundVariant[]
  selectedVariationKey: SelectedVariationKey
  selectedDownloadKeys: Set<string>
}
```

Text layer - это отдельная base-версия текста со своим набором generated background variants. Общим для всех layers является только original clean background.

Правила:

- `original` layer создается после `extract-layout` и не должен исчезать;
- `manual` layer создается из pasted text;
- `creative-import` layer создается из текста, извлеченного из другого креатива;
- обычные hook/CTA/body variations хранятся внутри `copyResult` конкретного layer;
- generated background variants хранятся внутри `backgroundVariants` конкретного layer;
- переключение вкладки text layer не должно смешивать variations/backgrounds/export selection между слоями.

### 5.7 BackgroundVariant

```ts
type BackgroundVariant = {
  id: string
  label: string
  imagePath: string
  mode: "original" | "light" | "medium" | "strong"
}
```

Оригинальный clean background представлен как:

```ts
{
  id: "original",
  label: "Original background",
  imagePath: step1Result.imagePath,
  mode: "original"
}
```

Generated backgrounds добавляются в `TextLayer.backgroundVariants` активного layer и рендерятся отдельными секциями только внутри этого layer.

## 6. API routes

### 6.1 POST /api/remove-text

Файл:

```txt
src/app/api/remove-text/route.ts
```

Назначение:

- принимает original creative image;
- вызывает `openai.images.edit` с `gpt-image-2`;
- удаляет весь видимый текст;
- сохраняет PNG в `public/generated`;
- возвращает путь и размеры.

Input:

```txt
FormData:
- image: File
- width: original image width
- height: original image height
```

Output:

```json
{
  "imagePath": "/generated/....png",
  "width": 1088,
  "height": 1920,
  "sourceWidth": 1080,
  "sourceHeight": 1920
}
```

Endpoint может скорректировать размер:

- ограничить экстремальный aspect ratio;
- ограничить max pixels;
- округлить width/height до кратности 16.

Frontend зеркалит эту sizing-логику перед `extract-layout`, чтобы clean background и extracted layout совпали по canvas size.

### 6.2 POST /api/extract-layout

Файл:

```txt
src/app/api/extract-layout/route.ts
```

Назначение:

- принимает original creative image;
- просит model реконструировать текстовый слой в editable JSON;
- возвращает `globalStyles` и `blocks`.

Input:

```txt
FormData:
- image: File
- width: target canvas width
- height: target canvas height
```

Output:

```json
{
  "globalStyles": "...",
  "blocks": []
}
```

Ключевые правила prompt:

- первый результат - editable replica, не вариация;
- блоки должны быть логическими, не раздробленными;
- spans использовать только при реальной inline-разнице стилей;
- для uniform style ставить `spans: null`;
- не допускать overlap текста;
- держать блоки внутри canvas;
- возвращать strict JSON по схеме.

Server normalization:

- clamp координат и размеров;
- normalization spans;
- удаление лишнего one-span wrapper, если span дублирует стиль блока;
- rough overlap/fit prevention.

### 6.3 POST /api/create-text-layer

Файл:

```txt
src/app/api/create-text-layer/route.ts
```

Назначение:

- принимает template layout из текущего редактора;
- принимает новый текст или другой creative image;
- адаптирует новый content под стиль/геометрию template layout;
- возвращает полный новый `LayoutResult`, не patches.

Input:

```txt
FormData:
- mode: "manual" | "creative-import"
- width: canvas width
- height: canvas height
- templateLayout: JSON.stringify(LayoutResult)
- pastedText: string, если mode="manual"
- sourceImage: File, если mode="creative-import"
```

Output:

```json
{
  "globalStyles": "...",
  "blocks": []
}
```

Главные правила:

- source of truth для текста - pasted text или видимый текст из imported creative;
- template layout - источник visual style, а не текст, который нужно сохранить;
- AI может добавлять/удалять blocks, если структура нового текста отличается;
- результат должен оставаться внутри canvas и не иметь overlap;
- если текст не помещается, уменьшать fontSize/lineHeight/letterSpacing и расширять width в пределах canvas;
- для uniform style ставить `spans: null`;
- `otherStyles` не должен перекрывать core layout/style поля.

### 6.4 POST /api/generate-copy-variations

Файл:

```txt
src/app/api/generate-copy-variations/route.ts
```

Назначение:

- принимает текущий edited layout;
- генерирует patch-based text variations для hook/CTA/body;
- не возвращает полный layout JSON.

Input:

```json
{
  "layout": {
    "blocks": []
  },
  "counts": {
    "hook": 5,
    "cta": 3,
    "body": 5
  },
  "hookMode": "medium",
  "userPrompt": "Make hooks more direct and focus on time savings."
}
```

Output:

```json
{
  "variations": [
    {
      "role": "body",
      "reason": "",
      "items": [
        {
          "id": "body-1",
          "patches": [
            {
              "blockId": "subheadline",
              "text": "DON'T LET ANOTHER MONDAY\nSTART THE SAME WAY"
            },
            {
              "blockId": "proof",
              "text": "A 28-day reset to help you\nbreak the task paralysis loop."
            }
          ]
        }
      ]
    }
  ]
}
```

Если роли нет:

```json
{
  "role": "cta",
  "items": [],
  "reason": "No CTA block exists in the current layout."
}
```

Главные правила:

- возвращать только text patches;
- никогда не менять layout/style поля;
- новый текст должен быть близок к оригиналу по визуальному размеру, line count и длине;
- `userPrompt` учитывать только если он совместим с layout fit, source creative, safety rules и patch-only контрактом;
- если есть сомнение, делать короче;
- body variation может патчить несколько body-блоков;
- hook mode управляет степенью отличия hook.

### 6.5 POST /api/generate-background-variant

Файл:

```txt
src/app/api/generate-background-variant/route.ts
```

Назначение:

- генерирует похожий text-free background;
- использует clean background и original creative;
- старается сохранить text-safe areas.

Input:

```txt
FormData:
- sourceImage: original uploaded File
- cleanImagePath: selected clean background path
- width: canvas width
- height: canvas height
- mode: "light" | "medium" | "strong"
- userPrompt: optional additional visual direction
- templateLayout: JSON.stringify(LayoutResult) for selected creative text-safe boxes
```

Output:

```json
{
  "id": "background-...",
  "label": "Background medium",
  "imagePath": "/generated/backgrounds/....png",
  "mode": "medium"
}
```

Prompt rules:

- не добавлять текст, буквы, цифры, labels, CTA, fake typography;
- сохранять text-safe areas;
- держать зоны текста спокойными и читаемыми;
- вернуть ровно тот же canvas size;
- `userPrompt` учитывать только если он совместим с selected mode, exact canvas size, text-safe zones и no-text requirements;
- reliability важнее novelty.

### 6.6 POST /api/generate-variations

Файл:

```txt
src/app/api/generate-variations/route.ts
```

Это старый endpoint для генерации HTML-вариаций из предыдущей версии. Текущий основной UI его не использует. Его можно удалить позже, если точно не нужен.

## 7. Frontend: важные компоненты и helpers

Основной route entrypoint:

```txt
src/app/page.tsx
```

Он только экспортирует workspace module. Основной client container:

```txt
src/modules/creative-workspace/CreativeWorkspacePage.tsx
```

Ключевые части:

- `CreativeWorkspacePage` - владеет всем state и основным флоу.
- `CreativeCanvas` - рендерит фон + absolute positioned text blocks.
- `EditorPanel` - панель редактирования блоков и spans.
- `CreateTextLayerModal` - создание полного нового text layer из pasted text или imported creative.
- `CopyVariationsPanel` - controls вариаций, background generation, карточки, export.
- `applyVariationPatches` - применяет AI patches к layout.
- `fitBlockText` - локальный auto-fit после изменения текста.
- `materializeCopyVariations` - создает layout snapshot для каждой variation card.
- `cloneLayout` - клонирует layout для независимых snapshots.
- `getImageEditSize` - client mirror sizing logic из `remove-text`.

Layer-specific state хранится внутри `TextLayer`: `baseLayout`, `copyResult`, `backgroundVariants`, `selectedVariationKey`, `selectedDownloadKeys`. Общими остаются uploaded source image, original clean background и canvas size.

## 8. Local auto-fit: fitBlockText

`fitBlockText` нужен, потому что AI может вернуть текст чуть длиннее оригинала.

Текущая логика:

1. Оценить ширину текста и количество строк.
2. Если текст не помещается:
   - уменьшить `fontSize`;
   - синхронно уменьшить `lineHeight`;
   - уменьшить `letterSpacing`;
   - расширить `width` в пределах canvas.
3. Если block `align: "center"`, при расширении ширины сохранить старый horizontal center.
4. Если текст все еще не помещается, увеличить `height` в доступных пределах.

Это эвристика, не pixel-perfect layout engine. Она ловит грубые overflow-кейсы, но часть карточек все равно может требовать ручной правки.

## 9. Generated files и storage

Сейчас generated images сохраняются локально:

```txt
public/generated
public/generated/backgrounds
```

Для local MVP это нормально.

В upload screen есть временная dev-панель `Generated files`:

```txt
GET /api/generated-assets
```

Возвращает список файлов, count и total size внутри `public/generated`.

```txt
POST /api/clear-generated-assets
```

Удаляет только содержимое `public/generated` и сбрасывает текущий workspace state, чтобы UI не ссылался на удаленные картинки.

Для production нужно вынести assets в object storage:

- S3;
- Cloudflare R2;
- Supabase Storage;
- другой persistent storage.

Нельзя рассчитывать на локальную файловую систему в serverless окружениях. Также нужен cleanup старых файлов.

## 10. Environment variables

Required:

```txt
OPENAI_API_KEY
```

Optional:

```txt
OPENAI_LAYOUT_MODEL
OPENAI_COPY_MODEL
```

Текущие defaults в коде:

```txt
OPENAI_LAYOUT_MODEL fallback: gpt-5.4
OPENAI_COPY_MODEL fallback: OPENAI_LAYOUT_MODEL или gpt-5.4
image edit model: gpt-image-2
```

## 11. Development commands

Install:

```bash
npm install
```

Dev server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Production server:

```bash
npm start
```

## 12. Текущие сильные стороны

- Layout стал structured JSON, а не opaque HTML.
- Есть human correction loop через редактор.
- Copy variations не переписывают layout.
- Background variations отделены от текста.
- Вариации показываются визуальными карточками.
- Ручная правка выбранной вариации обновляет только ее.
- Есть export в PNG/ZIP.
- Можно делать разные фоны без повторной генерации copy.

## 13. Текущие ограничения

- Нет auth.
- Нет rate limiting.
- Нет cost controls.
- Нет database.
- Нет persistent projects.
- Generated files лежат локально.
- Export большого количества high-res карточек может быть медленным.
- Layout extraction иногда требует ручной правки.
- Text fitting эвристический.
- Background generation иногда может добавить шум в text-safe zones.
- Нет undo/redo.
- Нет save/load проекта.
- Нет полноценной server-side validation uploaded files.
- Старый `/api/generate-variations` все еще лежит в проекте.

## 14. Что важно не сломать в будущей разработке

1. Не возвращаться к full HTML generation как главному механизму вариаций.
2. Генерация copy должна возвращать patches, не full layout.
3. Создание полного нового текста должно создавать `TextLayer` с полным `LayoutResult`, а не обычную `CopyVariation`.
4. `Original copy` layer должен оставаться доступным для возврата.
5. Variations должны хранить собственные layout snapshots.
6. Ручная правка selected variation не должна менять остальные variation cards.
7. Variations/background variants/export selection не должны смешиваться между text layers.
8. Layout для copy generation, visual generation и create text layer должен браться из текущего selected creative, не из raw `extract-layout`.
9. Background variants должны быть отдельными секциями, не dropdown-подменой.
10. AI не должен менять размеры/шрифты/цвета при copy variations.
11. Для blocks с единым стилем `spans` должен быть `null`.
12. Логические блоки нельзя дробить только из-за inline styling.
13. `otherStyles` не должен перекрывать core layout/style поля.

## 15. Suggested next steps

Product:

- протестировать 5-10 реальных креативов;
- собрать recurring failure types: text grouping, wrong roles, bad x/y, overlong hooks, noisy backgrounds;
- добавить warning, если auto-fit сильно поменял font size/width;
- добавить undo/redo;
- добавить duplicate block;
- добавить select/export all per section.

Engineering:

- добавить project persistence;
- вынести generated assets в object storage;
- добавить auth и ownership;
- добавить rate limits и usage/cost limits;
- добавить file size/mime validation;
- добавить export progress;
- рассмотреть server-side export;
- удалить legacy `/api/generate-variations`, если он точно больше не нужен.

Production:

- хранить исходники и generated files не в `public/generated`, а в storage;
- добавить cleanup;
- добавить billing/plan limits;
- логировать OpenAI latency/cost/errors;
- не показывать internal error details пользователю;
- добавить retry/backoff для image generation, где это безопасно.
