import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeCrop(crop) {
  return {
    focusX: clamp(Number(crop?.focusX) || 0.5, 0, 1),
    focusY: clamp(Number(crop?.focusY) || 0.5, 0, 1),
    zoom: clamp(Number(crop?.zoom) || 1, 1, 3),
  };
}

function getBoundedFocus(displaySize, frameSize, focus) {
  if (displaySize <= frameSize) return 0.5;

  const minFocus = frameSize / (2 * displaySize);
  const maxFocus = 1 - minFocus;
  return clamp(focus, minFocus, maxFocus);
}

export const CARTELL_LOGO_ASPECT_RATIO = 714 / 228;

export default function SeriesCoverFrame({
  imageUri,
  crop,
  onCropChange,
  strings,
  editable = false,
  showFrame = editable,
  height = 180,
  aspectRatio = null,
}) {
  const [frameSize, setFrameSize] = useState({ width: 0, height });
  const [imageSize, setImageSize] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const normalizedCrop = useMemo(() => normalizeCrop(crop), [crop]);
  const dragStartRef = useRef(normalizedCrop);
  const frameSizeRef = useRef(frameSize);
  const normalizedCropRef = useRef(normalizedCrop);

  useEffect(() => {
    frameSizeRef.current = frameSize;
  }, [frameSize]);

  useEffect(() => {
    normalizedCropRef.current = normalizedCrop;
  }, [normalizedCrop]);

  useEffect(() => {
    if (!imageUri) {
      setImageSize(null);
      setIsLoading(false);
      return undefined;
    }

    let isMounted = true;
    setIsLoading(true);

    Image.getSize(
      imageUri,
      (width, heightValue) => {
        if (!isMounted) return;
        setImageSize({ width, height: heightValue });
        setIsLoading(false);
      },
      () => {
        if (!isMounted) return;
        setImageSize(null);
        setIsLoading(false);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [imageUri]);

  const renderMetrics = useMemo(() => {
    if (!frameSize.width || !frameSize.height || !imageSize?.width || !imageSize?.height) {
      return null;
    }

    const baseScale = Math.max(
      frameSize.width / imageSize.width,
      frameSize.height / imageSize.height
    );
    const displayWidth = imageSize.width * baseScale * normalizedCrop.zoom;
    const displayHeight = imageSize.height * baseScale * normalizedCrop.zoom;
    const focusX = getBoundedFocus(displayWidth, frameSize.width, normalizedCrop.focusX);
    const focusY = getBoundedFocus(displayHeight, frameSize.height, normalizedCrop.focusY);

    return {
      displayWidth,
      displayHeight,
      focusX,
      focusY,
      offsetX: frameSize.width / 2 - focusX * displayWidth,
      offsetY: frameSize.height / 2 - focusY * displayHeight,
    };
  }, [frameSize, imageSize, normalizedCrop]);

  const commitCrop = (nextCrop) => {
    if (!onCropChange) return;
    onCropChange(normalizeCrop(nextCrop));
  };

  const handleZoom = (delta) => {
    const nextZoom = clamp(normalizedCrop.zoom + delta, 1, 3);
    if (!renderMetrics || !imageSize || nextZoom === normalizedCrop.zoom) return;

    const baseScale = Math.max(
      frameSize.width / imageSize.width,
      frameSize.height / imageSize.height
    );
    const nextDisplayWidth = imageSize.width * baseScale * nextZoom;
    const nextDisplayHeight = imageSize.height * baseScale * nextZoom;

    commitCrop({
      focusX: getBoundedFocus(nextDisplayWidth, frameSize.width, normalizedCrop.focusX),
      focusY: getBoundedFocus(nextDisplayHeight, frameSize.height, normalizedCrop.focusY),
      zoom: nextZoom,
    });
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(editable && Boolean(renderMetrics))
        .onBegin(() => {
          dragStartRef.current = normalizedCropRef.current;
        })
        .onUpdate((event) => {
          if (!renderMetrics) return;

          const currentFrameSize = frameSizeRef.current;
          const nextFocusX = getBoundedFocus(
            renderMetrics.displayWidth,
            currentFrameSize.width,
            dragStartRef.current.focusX - event.translationX / renderMetrics.displayWidth
          );
          const nextFocusY = getBoundedFocus(
            renderMetrics.displayHeight,
            currentFrameSize.height,
            dragStartRef.current.focusY - event.translationY / renderMetrics.displayHeight
          );

          commitCrop({
            ...dragStartRef.current,
            focusX: nextFocusX,
            focusY: nextFocusY,
          });
        }),
    [editable, renderMetrics]
  );

  const frame = (
    <View
      onLayout={(event) => {
        const { width, height: measuredHeight } = event.nativeEvent.layout;
        setFrameSize({ width, height: measuredHeight });
      }}
      style={{
        width: "100%",
        borderRadius: showFrame ? 16 : 0,
        overflow: "hidden",
        backgroundColor: showFrame ? "rgba(255,255,255,0.08)" : "transparent",
        borderWidth: showFrame ? 1 : 0,
        borderColor: "rgba(255,255,255,0.12)",
        ...(aspectRatio ? { aspectRatio } : { height }),
      }}
    >
      {imageUri && renderMetrics ? (
        <Image
          pointerEvents="none"
          source={{ uri: imageUri }}
          style={{
            position: "absolute",
            width: renderMetrics.displayWidth,
            height: renderMetrics.displayHeight,
            left: renderMetrics.offsetX,
            top: renderMetrics.offsetY,
          }}
        />
      ) : null}

      {!imageUri ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "rgba(255,255,255,0.7)" }}>
            {strings?.seriesImagesEmpty || "No hay imágenes disponibles para esta serie."}
          </Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}

      {editable && imageUri ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            inset: 0,
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.65)",
          }}
        />
      ) : null}
    </View>
  );

  return (
    <View>
      {editable ? <GestureDetector gesture={panGesture}>{frame}</GestureDetector> : frame}

      {editable && imageUri ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
          <Pressable
            onPress={() => handleZoom(-0.1)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.25)",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>-</Text>
          </Pressable>
          <Text style={{ color: "rgba(255,255,255,0.78)", flex: 1 }}>
            {strings?.seriesImageCropHint ||
              "Arrossega la imatge per decidir la zona visible del cartell."}
          </Text>
          <Pressable
            onPress={() => handleZoom(0.1)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.25)",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>+</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
