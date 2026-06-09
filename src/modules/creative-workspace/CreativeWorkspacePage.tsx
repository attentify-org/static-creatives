"use client";

import { useState } from "react";
import { CopyVariationsPanel } from "./components/CopyVariationsPanel";
import { CreativeCanvas } from "./components/CreativeCanvas";
import { EditorPanel } from "./components/EditorPanel";
import { CreateTextLayerModal } from "./components/CreateTextLayerModal";
import { UploadCreativePanel } from "./components/UploadCreativePanel";
import { VariationSettingsModal } from "./components/VariationSettingsModal";
import type {
  BackgroundMode,
  BackgroundVariant,
  CopyRole,
  CopyVariation,
  HookVariationMode,
  LayoutResult,
  Step1Result,
  TextBlock,
  TextLayer,
  TextLayerSource,
  TextSpan,
} from "./types";
import { postForm, requestJson } from "./utils/api";
import { getImageDimensions, getImageEditSize } from "./utils/image";
import {
  applyVariationPatches,
  cloneLayout,
  getInlineSpans,
  getOriginalVariationKey,
  getVariationKey,
  getVariationKeys,
  materializeCopyVariations,
  mergeCopyVariationResults,
} from "./utils/layout";
import { WATERMARK_TEXT } from "./utils/watermark";
import LogoIconSvg from "@/icons_jsx/LogoSvg";

export function CreativeWorkspacePage() {
  const [activeTab, setActiveTab] = useState<"upload" | "workspace">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [variationModalOpen, setVariationModalOpen] = useState<
    "text" | "visual" | null
  >(null);
  const [textLayerModalOpen, setTextLayerModalOpen] = useState(false);
  const [step1Status, setStep1Status] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [step1Result, setStep1Result] = useState<Step1Result | null>(null);
  const [step1Error, setStep1Error] = useState("");
  const [clearStatus, setClearStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [clearError, setClearError] = useState("");
  const [generatedAssetsStatus, setGeneratedAssetsStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [generatedAssetsError, setGeneratedAssetsError] = useState("");
  const [generatedAssetsInfo, setGeneratedAssetsInfo] = useState<{
    count: number;
    totalSize: number;
    files: Array<{
      path: string;
      size: number;
      updatedAt: string;
    }>;
  } | null>(null);

  const [layoutStatus, setLayoutStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [layoutResult, setLayoutResult] = useState<LayoutResult | null>(null);
  const [layoutError, setLayoutError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [selectedSpanIndex, setSelectedSpanIndex] = useState(0);
  const [copyCounts, setCopyCounts] = useState<Record<CopyRole, number>>({
    hook: 5,
    cta: 0,
    body: 0,
  });
  const [hookVariationMode, setHookVariationMode] =
    useState<HookVariationMode>("medium");
  const [copyPrompt, setCopyPrompt] = useState("");
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [copyError, setCopyError] = useState("");
  const [textLayerStatus, setTextLayerStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [textLayerError, setTextLayerError] = useState("");
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [activeTextLayerId, setActiveTextLayerId] = useState("");
  const [backgroundMode, setBackgroundMode] =
    useState<Exclude<BackgroundMode, "original">>("medium");
  const [backgroundPrompt, setBackgroundPrompt] = useState("");
  const [backgroundStatus, setBackgroundStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [backgroundError, setBackgroundError] = useState("");
  const [editorBackgroundId, setEditorBackgroundId] = useState("original");

  const activeTextLayer =
    textLayers.find((layer) => layer.id === activeTextLayerId) ?? null;
  const activeBaseLayout = activeTextLayer?.baseLayout ?? layoutResult;
  const activeCopyResult = activeTextLayer?.copyResult ?? null;
  const selectedVariationKey = activeTextLayer?.selectedVariationKey ?? null;
  const selectedDownloadKeys =
    activeTextLayer?.selectedDownloadKeys ?? new Set<string>();

  async function handleBuildCreative() {
    const file = selectedFile;
    if (!file) return;

    setActiveTab("upload");
    setStep1Status("loading");
    setStep1Error("");
    setStep1Result(null);
    setLayoutStatus("loading");
    setLayoutError("");
    setLayoutResult(null);
    setEditMode(false);
    setSelectedBlockId("");
    setSelectedSpanIndex(0);
    setCopyStatus("idle");
    setCopyPrompt("");
    setCopyError("");
    setTextLayerStatus("idle");
    setTextLayerError("");
    setTextLayers([]);
    setActiveTextLayerId("");
    setTextLayerModalOpen(false);
    setBackgroundPrompt("");
    setBackgroundStatus("idle");
    setBackgroundError("");
    setEditorBackgroundId("original");

    const sourceSize = await getImageDimensions(file);
    const targetSize = getImageEditSize(sourceSize.width, sourceSize.height);

    const removeTextFormData = new FormData();
    removeTextFormData.append("image", file);
    removeTextFormData.append("width", String(sourceSize.width));
    removeTextFormData.append("height", String(sourceSize.height));

    const extractLayoutFormData = new FormData();
    extractLayoutFormData.append("image", file);
    extractLayoutFormData.append("width", String(targetSize.width));
    extractLayoutFormData.append("height", String(targetSize.height));

    try {
      const [removeTextResult, layoutData] = await Promise.all([
        postForm<Step1Result>("/api/remove-text", removeTextFormData),
        postForm<LayoutResult>("/api/extract-layout", extractLayoutFormData),
      ]);

      const originalLayer: TextLayer = {
        id: "original",
        name: "Original copy",
        source: "original",
        baseLayout: cloneLayout(layoutData),
        copyResult: null,
        backgroundVariants: [],
        selectedVariationKey: null,
        selectedDownloadKeys: new Set([getOriginalVariationKey("original")]),
      };

      setStep1Result(removeTextResult);
      setLayoutResult(layoutData);
      setTextLayers([originalLayer]);
      setActiveTextLayerId(originalLayer.id);
      setSelectedBlockId(layoutData.blocks?.[0]?.id ?? "");
      setSelectedSpanIndex(0);
      setStep1Status("done");
      setLayoutStatus("done");
      setActiveTab("workspace");
      setEditMode(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStep1Error(message);
      setLayoutError(message);
      setStep1Status("error");
      setLayoutStatus("error");
    }
  }

  async function handleClearGeneratedAssets() {
    setClearStatus("loading");
    setClearError("");

    try {
      await requestJson<{ ok: boolean; deleted: number }>("/api/clear-generated-assets", {
        method: "POST",
      });

      setStep1Status("idle");
      setStep1Result(null);
      setStep1Error("");
      setLayoutStatus("idle");
      setLayoutResult(null);
      setLayoutError("");
      setEditMode(false);
      setSelectedBlockId("");
      setSelectedSpanIndex(0);
      setCopyStatus("idle");
      setCopyError("");
      setTextLayerStatus("idle");
      setTextLayerError("");
      setTextLayers([]);
      setActiveTextLayerId("");
      setVariationModalOpen(null);
      setTextLayerModalOpen(false);
      setBackgroundStatus("idle");
      setBackgroundError("");
      setEditorBackgroundId("original");
      setGeneratedAssetsInfo({ count: 0, totalSize: 0, files: [] });
      setActiveTab("upload");
      setClearStatus("done");
    } catch (err) {
      setClearError(err instanceof Error ? err.message : "Unknown error");
      setClearStatus("error");
    }
  }

  async function handleInspectGeneratedAssets() {
    setGeneratedAssetsStatus("loading");
    setGeneratedAssetsError("");

    try {
      const data = await requestJson<{
        count: number;
        totalSize: number;
        files: Array<{
          path: string;
          size: number;
          updatedAt: string;
        }>;
      }>("/api/generated-assets");

      setGeneratedAssetsInfo(data);
      setGeneratedAssetsStatus("done");
    } catch (err) {
      setGeneratedAssetsError(
        err instanceof Error ? err.message : "Unknown error",
      );
      setGeneratedAssetsStatus("error");
    }
  }

  function updateTextLayer(
    layerId: string,
    updater: (layer: TextLayer) => TextLayer,
  ) {
    setTextLayers((current) =>
      current.map((layer) => (layer.id === layerId ? updater(layer) : layer)),
    );
  }

  function updateActiveTextLayer(updater: (layer: TextLayer) => TextLayer) {
    if (!activeTextLayerId) return;
    updateTextLayer(activeTextLayerId, updater);
  }

  function getTextLayerEditorLayout(layer: TextLayer): LayoutResult {
    const variationKey = layer.selectedVariationKey;
    if (!variationKey) return cloneLayout(layer.baseLayout);

    const group = layer.copyResult?.variations.find(
      (item) => item.role === variationKey.role,
    );
    const variation = group?.items.find((item) => item.id === variationKey.id);
    if (!variation) return cloneLayout(layer.baseLayout);

    return cloneLayout(
      variation.layout ??
        applyVariationPatches(
          layer.baseLayout,
          variation,
          step1Result?.width,
          step1Result?.height,
        ),
    );
  }

  function selectTextLayer(layerId: string) {
    if (layerId === activeTextLayerId) return;
    const nextLayer = textLayers.find((layer) => layer.id === layerId);
    if (!nextLayer) return;

    commitCurrentEditorEdits();

    const nextLayout = getTextLayerEditorLayout(nextLayer);
    setActiveTextLayerId(nextLayer.id);
    setLayoutResult(nextLayout);
    setSelectedBlockId(nextLayout.blocks[0]?.id ?? "");
    setSelectedSpanIndex(0);
    setEditorBackgroundId(
      nextLayer.selectedVariationKey?.backgroundId ?? "original",
    );
    setEditMode(true);
  }

  function updateSelectedBlock(patch: Partial<TextBlock>) {
    if (!selectedBlockId) return;
    setLayoutResult((current) => {
      if (!current) return current;
      return {
        ...current,
        blocks: current.blocks.map((block) => {
          if (block.id !== selectedBlockId) return block;
          const nextBlock = { ...block, ...patch };

          if (typeof patch.text === "string" && !patch.spans) {
            nextBlock.spans = null;
            setSelectedSpanIndex(0);
          }

          return nextBlock;
        }),
      };
    });
  }

  function updateSelectedSpan(patch: Partial<TextSpan>) {
    if (!selectedBlockId) return;
    setLayoutResult((current) => {
      if (!current) return current;

      return {
        ...current,
        blocks: current.blocks.map((block) => {
          if (block.id !== selectedBlockId) return block;
          const spans = getInlineSpans(block);
          if (!spans.length) return block;
          const safeSpanIndex = Math.min(selectedSpanIndex, spans.length - 1);
          const nextSpans = spans.map((span, index) =>
            index === safeSpanIndex ? { ...span, ...patch } : span,
          );

          return {
            ...block,
            spans: nextSpans,
            text: nextSpans.map((span) => span.text).join(""),
          };
        }),
      };
    });
  }

  function selectBlock(id: string) {
    setSelectedBlockId(id);
    setSelectedSpanIndex(0);
  }

  function deleteSelectedBlock() {
    if (!selectedBlockId) return;
    setLayoutResult((current) => {
      if (!current) return current;

      const selectedIndex = current.blocks.findIndex(
        (block) => block.id === selectedBlockId,
      );
      const blocks = current.blocks.filter(
        (block) => block.id !== selectedBlockId,
      );
      const nextSelectedBlock =
        blocks[Math.min(selectedIndex, blocks.length - 1)] ?? blocks[0];
      setSelectedBlockId(nextSelectedBlock?.id ?? "");
      setSelectedSpanIndex(0);

      return { ...current, blocks };
    });
  }

  function addWatermarkBlock() {
    if (!layoutResult || !step1Result) return;

    const fontSize = Math.max(24, Math.round(step1Result.width * 0.045));
    const width = Math.min(
      Math.round(step1Result.width * 0.42),
      Math.max(220, fontSize * 5.8),
    );
    const height = Math.max(Math.round(fontSize * 1.25), 42);
    const block: TextBlock = {
      id: `watermark-${Date.now()}`,
      role: "logo",
      text: WATERMARK_TEXT,
      spans: null,
      x: Math.round((step1Result.width - width) / 2),
      y: Math.round((step1Result.height - height) / 2),
      width,
      height,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize,
      lineHeight: height,
      fontWeight: 700,
      letterSpacing: 0,
      color: "#ffffff",
      align: "center",
      textTransform: "none",
      zIndex: Math.max(
        1,
        ...layoutResult.blocks.map((item) => item.zIndex + 1),
      ),
      otherStyles: "opacity: 0.5;",
    };

    setLayoutResult({
      ...layoutResult,
      blocks: [...layoutResult.blocks, block],
    });
    setSelectedBlockId(block.id);
    setSelectedSpanIndex(0);
    setEditMode(true);
  }

  async function handleGenerateCopyVariations() {
    if (!layoutResult || !activeTextLayer) return;
    const layoutForVariations = cloneLayout(layoutResult);
    const sourceVariationKey = selectedVariationKey;

    commitCurrentEditorEdits();
    setCopyStatus("loading");
    setCopyError("");

    try {
      const data = await requestJson<{
        variations: Array<{
          role: CopyRole;
          items: CopyVariation[];
          reason: string;
        }>;
      }>("/api/generate-copy-variations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout: layoutForVariations,
          counts: copyCounts,
          hookMode: hookVariationMode,
          userPrompt: copyPrompt,
        }),
      });
      const materializedResult = materializeCopyVariations(
        data,
        layoutForVariations,
        step1Result?.width,
        step1Result?.height,
      );
      updateActiveTextLayer((layer) => {
        const mergedResult = mergeCopyVariationResults(
          layer.copyResult,
          materializedResult,
        );
        const nextDownloadKeys = new Set(layer.selectedDownloadKeys);
        backgrounds.forEach((background) => {
          nextDownloadKeys.add(getOriginalVariationKey(background.id));
          const existingKeys = layer.copyResult
            ? new Set(getVariationKeys(layer.copyResult, background.id))
            : new Set<string>();
          getVariationKeys(mergedResult, background.id).forEach((key) => {
            if (!existingKeys.has(key)) nextDownloadKeys.add(key);
          });
        });
        return {
          ...layer,
          baseLayout: sourceVariationKey
            ? layer.baseLayout
            : layoutForVariations,
          copyResult: mergedResult,
          selectedVariationKey: sourceVariationKey,
          selectedDownloadKeys: nextDownloadKeys,
        };
      });
      setLayoutResult(layoutForVariations);
      setSelectedBlockId(layoutForVariations.blocks[0]?.id ?? "");
      setSelectedSpanIndex(0);
      setCopyStatus("done");
      setVariationModalOpen(null);
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : "Unknown error");
      setCopyStatus("error");
    }
  }

  async function handleGenerateBackgroundVariant() {
    const file = selectedFile;
    if (
      !file ||
      !step1Result ||
      !activeTextLayer ||
      !layoutResult ||
      !editorBackground
    )
      return;

    setBackgroundStatus("loading");
    setBackgroundError("");

    const formData = new FormData();
    formData.append("sourceImage", file);
    formData.append("cleanImagePath", editorBackground.imagePath);
    if (editorBackground.imageAssetId) {
      formData.append("cleanImageAssetId", editorBackground.imageAssetId);
    }
    formData.append("width", String(step1Result.width));
    formData.append("height", String(step1Result.height));
    formData.append("mode", backgroundMode);
    formData.append("userPrompt", backgroundPrompt);
    formData.append("templateLayout", JSON.stringify(layoutResult));

    try {
      const data = await postForm<BackgroundVariant>(
        "/api/generate-background-variant",
        formData,
      );
      const numberedBackground = {
        ...data,
        label: `Background variant ${activeTextLayer.backgroundVariants.length + 1} (${backgroundMode})`,
      };
      updateActiveTextLayer((layer) => {
        const nextKeys = [getOriginalVariationKey(numberedBackground.id)];
        if (layer.copyResult)
          nextKeys.push(
            ...getVariationKeys(layer.copyResult, numberedBackground.id),
          );
        return {
          ...layer,
          backgroundVariants: [...layer.backgroundVariants, numberedBackground],
          selectedDownloadKeys: new Set([
            ...layer.selectedDownloadKeys,
            ...nextKeys,
          ]),
        };
      });
      setBackgroundStatus("done");
      setVariationModalOpen(null);
    } catch (err) {
      setBackgroundError(err instanceof Error ? err.message : "Unknown error");
      setBackgroundStatus("error");
    }
  }

  function selectCopyVariation(
    backgroundId: string,
    role: CopyRole,
    variation: CopyVariation,
  ) {
    if (!activeTextLayer) return;

    commitCurrentEditorEdits();

    const sourceBaseLayout = selectedVariationKey
      ? activeTextLayer.baseLayout
      : (layoutResult ?? activeTextLayer.baseLayout);
    const nextLayout = cloneLayout(
      variation.layout ??
        applyVariationPatches(
          sourceBaseLayout,
          variation,
          step1Result?.width,
          step1Result?.height,
        ),
    );
    setLayoutResult(nextLayout);
    setSelectedBlockId(nextLayout.blocks[0]?.id ?? "");
    setSelectedSpanIndex(0);
    setEditorBackgroundId(backgroundId);
    updateActiveTextLayer((layer) => ({
      ...layer,
      selectedVariationKey: { backgroundId, role, id: variation.id },
    }));
    setEditMode(true);
  }

  function selectOriginalCreative(backgroundId: string) {
    if (!activeTextLayer) return;

    commitCurrentEditorEdits();
    const sourceLayout = selectedVariationKey
      ? activeTextLayer.baseLayout
      : (layoutResult ?? activeTextLayer.baseLayout);
    const nextLayout = cloneLayout(sourceLayout);
    setLayoutResult(nextLayout);
    setSelectedBlockId(nextLayout.blocks[0]?.id ?? "");
    setSelectedSpanIndex(0);
    setEditorBackgroundId(backgroundId);
    updateActiveTextLayer((layer) => ({
      ...layer,
      selectedVariationKey: null,
    }));
    setEditMode(true);
  }

  function toggleEditMode() {
    if (editMode) {
      commitCurrentEditorEdits();
      setEditMode(false);
      return;
    }

    setEditMode(true);
  }

  function toggleDownloadSelection(key: string, selected: boolean) {
    updateActiveTextLayer((layer) => {
      const next = new Set(layer.selectedDownloadKeys);
      if (selected) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return {
        ...layer,
        selectedDownloadKeys: next,
      };
    });
  }

  function deleteCopyVariation(role: CopyRole, variationId: string) {
    if (!activeTextLayer) return;

    updateActiveTextLayer((layer) => {
      const nextDownloadKeys = new Set(layer.selectedDownloadKeys);
      backgrounds.forEach((background) => {
        nextDownloadKeys.delete(
          getVariationKey(background.id, role, variationId),
        );
      });

      return {
        ...layer,
        copyResult: layer.copyResult
          ? {
              ...layer.copyResult,
              variations: layer.copyResult.variations.map((group) =>
                group.role === role
                  ? {
                      ...group,
                      items: group.items.filter(
                        (item) => item.id !== variationId,
                      ),
                    }
                  : group,
              ),
            }
          : null,
        selectedDownloadKeys: nextDownloadKeys,
      };
    });

    if (
      selectedVariationKey?.role === role &&
      selectedVariationKey.id === variationId
    ) {
      const nextLayout = cloneLayout(activeTextLayer.baseLayout);
      setLayoutResult(nextLayout);
      setSelectedBlockId(nextLayout.blocks[0]?.id ?? "");
      setSelectedSpanIndex(0);
      updateActiveTextLayer((layer) => ({
        ...layer,
        selectedVariationKey: null,
      }));
    }
  }

  function commitSelectedVariationEdits() {
    if (!selectedVariationKey || !layoutResult || !activeTextLayer) return;

    updateActiveTextLayer((layer) => {
      if (!layer.copyResult) return layer;

      return {
        ...layer,
        copyResult: {
          ...layer.copyResult,
          variations: layer.copyResult.variations.map((group) => {
            if (group.role !== selectedVariationKey.role) return group;

            return {
              ...group,
              items: group.items.map((item) =>
                item.id === selectedVariationKey.id
                  ? { ...item, layout: cloneLayout(layoutResult) }
                  : item,
              ),
            };
          }),
        },
      };
    });
  }

  function commitCurrentEditorEdits() {
    if (!layoutResult || !activeTextLayer) return;

    if (selectedVariationKey) {
      commitSelectedVariationEdits();
      return;
    }

    const nextLayout = cloneLayout(layoutResult);
    updateActiveTextLayer((layer) => ({
      ...layer,
      baseLayout: nextLayout,
    }));
  }

  async function handleCreateTextLayer({
    name,
    source,
    pastedText,
    sourceImage,
  }: {
    name: string;
    source: Exclude<TextLayerSource, "original">;
    pastedText: string;
    sourceImage: File | null;
  }) {
    if (!layoutResult || !step1Result) return;

    const templateLayout = cloneLayout(layoutResult);
    commitCurrentEditorEdits();
    setTextLayerStatus("loading");
    setTextLayerError("");

    const formData = new FormData();
    formData.append("mode", source);
    formData.append("width", String(step1Result.width));
    formData.append("height", String(step1Result.height));
    formData.append("templateLayout", JSON.stringify(templateLayout));
    if (source === "manual") {
      formData.append("pastedText", pastedText);
    } else if (sourceImage) {
      formData.append("sourceImage", sourceImage);
    }

    try {
      const newLayout = await postForm<LayoutResult>(
        "/api/create-text-layer",
        formData,
      );
      const layerId = `text-layer-${Date.now()}`;
      const layerName = name.trim() || `Text layer ${textLayers.length + 1}`;
      const selectedBackground =
        editorBackground.id === "original" ? null : editorBackground;
      const defaultDownloadKeys = new Set([
        getOriginalVariationKey(selectedBackground?.id ?? "original"),
      ]);
      const nextLayer: TextLayer = {
        id: layerId,
        name: layerName,
        source,
        baseLayout: cloneLayout(newLayout),
        copyResult: null,
        backgroundVariants: selectedBackground ? [selectedBackground] : [],
        selectedVariationKey: null,
        selectedDownloadKeys: defaultDownloadKeys,
      };

      setTextLayers((current) => [...current, nextLayer]);
      setActiveTextLayerId(nextLayer.id);
      setLayoutResult(newLayout);
      setSelectedBlockId(newLayout.blocks[0]?.id ?? "");
      setSelectedSpanIndex(0);
      setEditorBackgroundId(selectedBackground?.id ?? "original");
      setCopyStatus("idle");
      setCopyError("");
      setTextLayerStatus("done");
      setTextLayerModalOpen(false);
      setEditMode(true);
    } catch (err) {
      setTextLayerError(err instanceof Error ? err.message : "Unknown error");
      setTextLayerStatus("error");
    }
  }

  function nudgeSelectedBlock(dx: number, dy: number) {
    const block = layoutResult?.blocks.find(
      (item) => item.id === selectedBlockId,
    );
    if (!block) return;
    updateSelectedBlock({ x: block.x + dx, y: block.y + dy });
  }

  function moveBlock(blockId: string, x: number, y: number) {
    setLayoutResult((current) => {
      if (!current) return current;

      return {
        ...current,
        blocks: current.blocks.map((block) =>
          block.id === blockId ? { ...block, x, y } : block,
        ),
      };
    });
  }

  const selectedBlock =
    layoutResult?.blocks.find((block) => block.id === selectedBlockId) ?? null;
  const selectedSpans = selectedBlock ? getInlineSpans(selectedBlock) : [];
  const selectedSpan =
    selectedSpans[selectedSpanIndex] ?? selectedSpans[0] ?? null;
  const backgrounds: BackgroundVariant[] = step1Result
    ? [
        {
          id: "original",
          label: "Original background",
          imagePath: step1Result.imagePath,
          imageAssetId: step1Result.imageAssetId,
          imageKey: step1Result.imageKey,
          mode: "original",
        },
        ...(activeTextLayer?.backgroundVariants ?? []),
      ]
    : [];
  const editorBackground =
    backgrounds.find((background) => background.id === editorBackgroundId) ??
    backgrounds[0];
  const canOpenWorkspace =
    step1Status === "done" &&
    layoutStatus === "done" &&
    Boolean(step1Result && layoutResult);
  const isBuilding = step1Status === "loading" || layoutStatus === "loading";

  return (
    <main className="min-h-screen bg-[#f7f4fb] text-[#17121f]">
      <header className="sticky top-0 z-30 border-b border-[#e6deee] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <LogoIconSvg className="h-10 w-auto text-[#5b21b6]" />
            <div>
              <h1 className="text-sm font-semibold tracking-tight">
                Creatives App
              </h1>
              <p className="text-xs text-[#8a8294]">
                Editable AI creative workspace
              </p>
            </div>
          </div>

          <nav className="flex rounded-full border border-[#e4ddeb] bg-[#f8f5fb] p-1 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={[
                "rounded-full px-4 py-2 transition",
                activeTab === "upload"
                  ? "bg-white text-[#5b21b6] shadow-sm"
                  : "text-[#756c81]",
              ].join(" ")}
            >
              Upload
            </button>
            <button
              type="button"
              disabled={!canOpenWorkspace}
              onClick={() => setActiveTab("workspace")}
              className={[
                "rounded-full px-4 py-2 transition disabled:cursor-not-allowed disabled:opacity-40",
                activeTab === "workspace"
                  ? "bg-white text-[#5b21b6] shadow-sm"
                  : "text-[#756c81]",
              ].join(" ")}
            >
              Workspace
            </button>
          </nav>
        </div>
      </header>

      {activeTab === "upload" && (
        <UploadCreativePanel
          selectedFile={selectedFile}
          isBuilding={isBuilding}
          isClearing={clearStatus === "loading"}
          isInspectingGeneratedAssets={generatedAssetsStatus === "loading"}
          canOpenWorkspace={canOpenWorkspace}
          error={
            step1Error || layoutError || clearError || generatedAssetsError
          }
          notice={clearStatus === "done" ? "Generated files cleared." : ""}
          generatedAssetsInfo={generatedAssetsInfo}
          onSelectFile={setSelectedFile}
          onBuildCreative={handleBuildCreative}
          onOpenWorkspace={() => setActiveTab("workspace")}
          onInspectGeneratedAssets={handleInspectGeneratedAssets}
          onClearGeneratedAssets={handleClearGeneratedAssets}
        />
      )}

      {activeTab === "workspace" &&
        step1Result &&
        layoutResult &&
        editorBackground && (
          <section className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 py-6">
            <div className="rounded-2xl border border-[#e5ddec] bg-white p-4 shadow-[0_18px_60px_rgba(35,20,55,0.06)]">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5cf6]">
                  Text layers
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTextLayerError("");
                    setTextLayerStatus("idle");
                    setTextLayerModalOpen(true);
                  }}
                  className="rounded-xl border border-[#cfc2df] bg-white px-4 py-2 text-sm font-semibold text-[#5b21b6] transition hover:bg-[#f6f0ff]"
                >
                  Create text layer
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {textLayers.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => selectTextLayer(layer.id)}
                    className={[
                      "shrink-0 rounded-xl border px-4 py-2 text-left text-sm transition",
                      layer.id === activeTextLayerId
                        ? "border-[#7c3aed] bg-[#f4efff] text-[#4c1d95]"
                        : "border-[#e2d8ed] bg-white text-[#6b6276] hover:bg-[#fbf9fe]",
                    ].join(" ")}
                  >
                    <span className="block font-semibold">{layer.name}</span>
                    <span className="block text-xs opacity-70">
                      {layer.source === "original"
                        ? "Original"
                        : layer.source === "manual"
                          ? "Manual text"
                          : "Imported creative"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 rounded-2xl border border-[#e5ddec] bg-white p-4 shadow-[0_24px_80px_rgba(35,20,55,0.08)]">
                <div className="mb-4 flex flex-col gap-3 border-b border-[#eee8f4] pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5cf6]">
                      Workspace
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                      {activeTextLayer?.name ?? "Current creative"}
                    </h2>
                    <p className="text-xs text-[#8a8294]">
                      {layoutResult.blocks.length} text blocks ·{" "}
                      {editorBackground.label}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={toggleEditMode}
                      className="rounded-xl border border-[#ddd4e8] px-4 py-2 text-sm font-semibold text-[#4c3b63] transition hover:bg-[#f8f4ff]"
                    >
                      {editMode ? "Done editing" : "Edit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVariationModalOpen("text")}
                      className="rounded-xl bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.24)] transition hover:bg-[#6d28d9]"
                    >
                      Generate text variations
                    </button>
                    <button
                      type="button"
                      onClick={() => setVariationModalOpen("visual")}
                      className="rounded-xl border border-[#cfc2df] bg-white px-4 py-2 text-sm font-semibold text-[#5b21b6] transition hover:bg-[#f6f0ff]"
                    >
                      Generate visual variations
                    </button>
                  </div>
                </div>

                <div className="flex min-h-[620px] items-start justify-center overflow-auto rounded-xl bg-[#f3eff8] p-6">
                  <CreativeCanvas
                    imagePath={getBackgroundImageSrc(editorBackground)}
                    width={step1Result.width}
                    height={step1Result.height}
                    globalStyles={layoutResult.globalStyles}
                    blocks={layoutResult.blocks}
                    editMode={editMode}
                    selectedBlockId={selectedBlockId}
                    onSelectBlock={selectBlock}
                    onMoveBlock={moveBlock}
                  />
                </div>
              </div>

              <EditorPanel
                blocks={layoutResult.blocks}
                selectedBlock={selectedBlock}
                selectedBlockId={selectedBlockId}
                selectedSpan={selectedSpan}
                selectedSpanIndex={Math.min(
                  selectedSpanIndex,
                  Math.max(0, selectedSpans.length - 1),
                )}
                editMode={editMode}
                canvasWidth={step1Result.width}
                onSelectBlock={selectBlock}
                onSelectSpan={setSelectedSpanIndex}
                onUpdateBlock={updateSelectedBlock}
                onUpdateSpan={updateSelectedSpan}
                onNudgeBlock={nudgeSelectedBlock}
                onAddWatermark={addWatermarkBlock}
                onDeleteBlock={deleteSelectedBlock}
              />
            </div>

            <CopyVariationsPanel
              backgrounds={backgrounds}
              canvasWidth={step1Result.width}
              canvasHeight={step1Result.height}
              baseLayout={activeBaseLayout ?? layoutResult}
              status={copyStatus}
              result={activeCopyResult}
              error={copyError}
              onSelectOriginal={selectOriginalCreative}
              onSelectVariation={selectCopyVariation}
              selectedBackgroundId={editorBackground.id}
              selectedVariationKey={selectedVariationKey}
              selectedDownloadKeys={selectedDownloadKeys}
              onToggleDownloadSelection={toggleDownloadSelection}
              onDeleteVariation={deleteCopyVariation}
            />
          </section>
        )}

      {variationModalOpen && (
        <VariationSettingsModal
          mode={variationModalOpen}
          counts={copyCounts}
          hookMode={hookVariationMode}
          copyPrompt={copyPrompt}
          backgroundMode={backgroundMode}
          backgroundPrompt={backgroundPrompt}
          copyStatus={copyStatus}
          backgroundStatus={backgroundStatus}
          copyError={copyError}
          backgroundError={backgroundError}
          onClose={() => setVariationModalOpen(null)}
          onChangeCounts={setCopyCounts}
          onChangeHookMode={setHookVariationMode}
          onChangeCopyPrompt={setCopyPrompt}
          onChangeBackgroundMode={setBackgroundMode}
          onChangeBackgroundPrompt={setBackgroundPrompt}
          onGenerateCopy={handleGenerateCopyVariations}
          onGenerateBackground={handleGenerateBackgroundVariant}
        />
      )}

      {textLayerModalOpen && (
        <CreateTextLayerModal
          status={textLayerStatus}
          error={textLayerError}
          defaultName={`Text layer ${textLayers.length + 1}`}
          onClose={() => {
            if (textLayerStatus !== "loading") setTextLayerModalOpen(false);
          }}
          onCreate={handleCreateTextLayer}
        />
      )}
    </main>
  );
}

function getBackgroundImageSrc(background: BackgroundVariant) {
  if (!background.imageAssetId) return background.imagePath;
  return `/api/creative-assets/${encodeURIComponent(background.imageAssetId)}/download`;
}
