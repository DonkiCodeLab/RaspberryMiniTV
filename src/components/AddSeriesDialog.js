import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { searchTvSeries } from "../services/tmdbApi";

export default function AddSeriesDialog({
  visible,
  strings,
  localeTag,
  existingSeriesIds = [],
  onClose,
  onAddSeries,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setSelectedId(null);
      setIsSearching(false);
      setError("");
    }
  }, [visible]);

  const onSearch = useCallback(async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    setIsSearching(true);
    setError("");
    setSelectedId(null);

    try {
      const found = await searchTvSeries(trimmedQuery, localeTag);
      setResults(found);
    } catch (err) {
      setResults([]);
      setError(String(err?.message || err));
    } finally {
      setIsSearching(false);
    }
  }, [localeTag, query]);

  const selectedResult = results.find((item) => item.id === selectedId) || null;
  const existingIdsSet = new Set(existingSeriesIds.map((id) => Number(id)).filter(Boolean));

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
            maxHeight: "78%",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16, marginBottom: 10 }}>
            {strings?.addSeriesTitle || "Añadir serie"}
          </Text>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={strings?.seriesSearchPlaceholder || "Escribe el nombre de una serie"}
              placeholderTextColor="rgba(255,255,255,0.45)"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={onSearch}
              style={{
                flex: 1,
                color: "#fff",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.18)",
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: "rgba(255,255,255,0.06)",
              }}
            />
            <Pressable
              onPress={onSearch}
              style={({ pressed }) => ({
                borderRadius: 12,
                paddingHorizontal: 14,
                justifyContent: "center",
                backgroundColor: pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.12)",
              })}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {strings?.search || "Buscar"}
              </Text>
            </Pressable>
          </View>

          {isSearching ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: "#fff", marginTop: 10 }}>
                {strings?.searchingSeries || "Buscando series..."}
              </Text>
            </View>
          ) : error ? (
            <Text style={{ color: "#fff", marginBottom: 12 }}>{error}</Text>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => String(item.id)}
              style={{ maxHeight: 360 }}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
              )}
              ListEmptyComponent={
                <Text style={{ color: "rgba(255,255,255,0.7)", paddingVertical: 16 }}>
                  {query.trim()
                    ? strings?.noSeriesResults || "No se han encontrado resultados."
                    : strings?.seriesSearchHint || "Busca una serie para añadirla."}
                </Text>
              }
              renderItem={({ item }) => {
                const isSelected = item.id === selectedId;
                const alreadyAdded = existingIdsSet.has(Number(item.id));

                return (
                  <Pressable
                    disabled={alreadyAdded}
                    onPress={() => setSelectedId(item.id)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 10,
                      opacity: alreadyAdded ? 0.45 : pressed ? 0.75 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 54,
                        height: 72,
                        borderRadius: 10,
                        overflow: "hidden",
                        backgroundColor: "rgba(255,255,255,0.08)",
                      }}
                    >
                      {item.image ? (
                        <Image
                          source={{ uri: item.image }}
                          style={{ width: "100%", height: "100%" }}
                          resizeMode="cover"
                        />
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff", fontSize: 15, fontWeight: isSelected ? "800" : "600" }}>
                        {item.name}
                      </Text>
                      {item.firstAirDate ? (
                        <Text style={{ color: "rgba(255,255,255,0.72)", marginTop: 3 }}>
                          {item.firstAirDate}
                        </Text>
                      ) : null}
                      {alreadyAdded ? (
                        <Text style={{ color: "#fbbf24", marginTop: 4 }}>
                          {strings?.seriesAlreadyAdded || "Ya está añadida"}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ color: isSelected ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 16 }}>
                      {isSelected ? "✓" : ""}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
            <Pressable onPress={onClose} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                {strings?.cancel || "Cancelar"}
              </Text>
            </Pressable>
            <Pressable
              disabled={!selectedResult}
              onPress={() => selectedResult && onAddSeries(selectedResult)}
              style={({ pressed }) => ({
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor:
                  !selectedResult
                    ? "rgba(255,255,255,0.12)"
                    : pressed
                    ? "rgba(34,197,94,0.8)"
                    : "#22c55e",
                opacity: selectedResult ? 1 : 0.5,
              })}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {strings?.addSelectedSeries || "Añadir"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
