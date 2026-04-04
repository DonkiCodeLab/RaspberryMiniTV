import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import SeriesCoverFrame, { CARTELL_LOGO_ASPECT_RATIO } from "./SeriesCoverFrame";

const DEFAULT_CROP = {
  focusX: 0.5,
  focusY: 0.5,
  zoom: 1,
};

export default function SeriesOptionsDialog({
  visible,
  strings,
  series,
  imageOptions = [],
  onClose,
  onSaveSeriesOptions,
  onDeleteSeries,
}) {
  const [name, setName] = useState(series?.name || "");
  const [selectedImage, setSelectedImage] = useState(series?.selectedImage || null);
  const [selectedImageCrop, setSelectedImageCrop] = useState(
    series?.selectedImageCrop || DEFAULT_CROP
  );

  useEffect(() => {
    setName(series?.name || "");
    setSelectedImage(series?.selectedImage || null);
    setSelectedImageCrop(series?.selectedImageCrop || DEFAULT_CROP);
  }, [series, visible]);

  const trimmedName = name.trim();
  const normalizedImageOptions = useMemo(() => {
    const seen = new Set();
    const nextOptions = [];

    (Array.isArray(imageOptions) ? imageOptions : []).forEach((imageUrl) => {
      const normalized = String(imageUrl || "").trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      nextOptions.push(normalized);
    });

    if (selectedImage && !seen.has(selectedImage)) {
      nextOptions.unshift(selectedImage);
    }

    return nextOptions;
  }, [imageOptions, selectedImage]);

  const handleSave = () => {
    if (!trimmedName) return;

    onSaveSeriesOptions(series, {
      name: trimmedName,
      selectedImage,
      selectedImageCrop: selectedImage ? selectedImageCrop : null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 18,
          backgroundColor: "rgba(0,0,0,0.55)",
        }}
      >
        <Pressable
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={onClose}
        />
        <View
          style={{
            backgroundColor: "rgba(18,18,18,0.98)",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.15)",
            padding: 14,
            maxHeight: "86%",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16, marginBottom: 10 }}>
            {strings?.seriesOptionsTitle || "Opciones de la serie"}
          </Text>

          <Text style={{ color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>
            {strings?.seriesNameLabel || "Nombre"}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={strings?.seriesNamePlaceholder || "Nombre de la serie"}
            placeholderTextColor="rgba(255,255,255,0.45)"
            autoCapitalize="words"
            autoCorrect={false}
            style={{
              color: "#fff",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.18)",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          />

          <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 14, marginBottom: 8 }}>
            {strings?.seriesImageLabel || "Imagen"}
          </Text>

          {normalizedImageOptions.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 4 }}
            >
              {normalizedImageOptions.map((imageUrl) => {
                const isActive = imageUrl === selectedImage;

                return (
                  <Pressable
                    key={imageUrl}
                    onPress={() => {
                      setSelectedImage(imageUrl);
                      setSelectedImageCrop(
                        imageUrl === selectedImage ? selectedImageCrop : DEFAULT_CROP
                      );
                    }}
                    style={({ pressed }) => ({
                      width: 118,
                      borderRadius: 14,
                      overflow: "hidden",
                      borderWidth: 2,
                      borderColor: isActive ? "#22c55e" : "rgba(255,255,255,0.18)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      opacity: pressed ? 0.82 : 1,
                    })}
                  >
                    <Image
                      source={{ uri: imageUrl }}
                      style={{ width: "100%", height: 168 }}
                      resizeMode="cover"
                    />
                    <View style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                        {isActive
                          ? strings?.seriesImageSelected || "Carátula seleccionada"
                          : strings?.seriesImageUse || "Usar esta imagen"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.04)",
                paddingHorizontal: 12,
                paddingVertical: 14,
              }}
            >
              <Text style={{ color: "rgba(255,255,255,0.7)" }}>
                {strings?.seriesImagesEmpty || "No hay imágenes disponibles para esta serie."}
              </Text>
            </View>
          )}

          <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 16, marginBottom: 8 }}>
            {strings?.seriesImageCropLabel || "Región visible del cartel"}
          </Text>
          <SeriesCoverFrame
            imageUri={selectedImage}
            crop={selectedImageCrop}
            onCropChange={setSelectedImageCrop}
            strings={strings}
            editable
            aspectRatio={CARTELL_LOGO_ASPECT_RATIO}
          />

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
            <Pressable
              onPress={() => {
                Alert.alert(
                  strings?.deleteSeriesTitle || "Eliminar serie",
                  strings?.deleteSeriesMessage || "¿Seguro que quieres eliminar esta serie?",
                  [
                    { text: strings?.cancel || "Cancelar", style: "cancel" },
                    {
                      text: strings?.delete || "Eliminar",
                      style: "destructive",
                      onPress: () => onDeleteSeries(series),
                    },
                  ]
                );
              }}
              style={({ pressed }) => ({
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: pressed ? "rgba(239,68,68,0.78)" : "#ef4444",
              })}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {strings?.delete || "Eliminar"}
              </Text>
            </Pressable>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={onClose} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {strings?.cancel || "Cancelar"}
                </Text>
              </Pressable>
              <Pressable
                disabled={!trimmedName}
                onPress={handleSave}
                style={({ pressed }) => ({
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor:
                    !trimmedName
                      ? "rgba(255,255,255,0.12)"
                      : pressed
                      ? "rgba(59,130,246,0.78)"
                      : "#3b82f6",
                  opacity: trimmedName ? 1 : 0.5,
                })}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  {strings?.save || "Guardar"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
