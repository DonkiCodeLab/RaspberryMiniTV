import React, { useEffect, useState } from "react";
import { Alert, Modal, Pressable, Text, TextInput, View } from "react-native";

export default function SeriesOptionsDialog({
  visible,
  strings,
  series,
  onClose,
  onRenameSeries,
  onDeleteSeries,
}) {
  const [name, setName] = useState(series?.name || "");

  useEffect(() => {
    setName(series?.name || "");
  }, [series, visible]);

  const trimmedName = name.trim();

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

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 14 }}>
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
                onPress={() => onRenameSeries(series, trimmedName)}
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
