import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { getRaspberryVideos } from "../services/raspberryApi";
import { searchTvSeries } from "../services/tmdbApi";

function normalizeSearchLabel(value) {
  return String(value || "")
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeSearchLabel(value)
    .toLowerCase()
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getMatchScore(directoryName, candidate) {
  const directoryLabel = normalizeSearchLabel(directoryName).toLowerCase();
  const candidateName = String(candidate?.name || "").trim().toLowerCase();

  if (!directoryLabel || !candidateName) return 0;
  if (directoryLabel === candidateName) return 1000;

  let score = 0;
  const directoryTokens = tokenize(directoryName);
  const candidateTokens = tokenize(candidate?.name);

  directoryTokens.forEach((token) => {
    if (candidateTokens.includes(token)) {
      score += 24;
    } else if (candidateName.includes(token)) {
      score += 10;
    }
  });

  if (candidateName.startsWith(directoryLabel)) score += 80;
  if (candidateName.includes(directoryLabel)) score += 50;

  return score;
}

function sortMatches(directoryName, candidates) {
  return [...candidates].sort((left, right) => {
    const scoreDiff = getMatchScore(directoryName, right) - getMatchScore(directoryName, left);
    if (scoreDiff !== 0) return scoreDiff;

    const leftDate = String(left?.firstAirDate || "");
    const rightDate = String(right?.firstAirDate || "");
    return leftDate.localeCompare(rightDate);
  });
}

async function buildDirectoryMatch(directory, localeTag) {
  const matches = sortMatches(
    directory?.name,
    await searchTvSeries(normalizeSearchLabel(directory?.name), localeTag)
  ).slice(0, 6);

  return {
    directoryName: directory?.name || "",
    directoryPath: directory?.relativePath || directory?.name || "",
    episodeIds: Array.isArray(directory?.episodeIds) ? directory.episodeIds : [],
    episodeCount: Number(directory?.episodeCount) || 0,
    videoCount: Number(directory?.videoCount) || 0,
    matches,
    selectedMatchId: matches[0]?.id || null,
    selected: Boolean(matches[0]?.id),
    expanded: false,
  };
}

export default function RaspberrySyncDialog({
  visible,
  strings,
  localeTag,
  existingSeries = [],
  onClose,
  onSave,
}) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const existingSeriesById = useMemo(() => {
    const map = new Map();
    existingSeries.forEach((series) => {
      if (!series?.id) return;
      map.set(Number(series.id), series);
    });
    return map;
  }, [existingSeries]);

  useEffect(() => {
    if (!visible) {
      setItems([]);
      setError("");
      setIsLoading(false);
      return;
    }

    let isActive = true;

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await getRaspberryVideos();
        const directories = Array.isArray(response?.directories) ? response.directories : [];
        const matched = await Promise.all(
          directories.map((directory) => buildDirectoryMatch(directory, localeTag))
        );

        if (!isActive) return;
        setItems(matched);
      } catch (err) {
        if (!isActive) return;
        setItems([]);
        setError(String(err?.message || err));
      } finally {
        if (isActive) setIsLoading(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [localeTag, visible]);

  const selectedEntries = items.filter((item) => item.selected && item.selectedMatchId);
  const canSave = selectedEntries.length > 0;

  const toggleItem = useCallback((directoryPath) => {
    setItems((current) =>
      current.map((item) =>
        item.directoryPath === directoryPath ? { ...item, selected: !item.selected } : item
      )
    );
  }, []);

  const toggleExpanded = useCallback((directoryPath) => {
    setItems((current) =>
      current.map((item) =>
        item.directoryPath === directoryPath ? { ...item, expanded: !item.expanded } : item
      )
    );
  }, []);

  const selectMatch = useCallback((directoryPath, matchId) => {
    setItems((current) =>
      current.map((item) =>
        item.directoryPath === directoryPath
          ? { ...item, selectedMatchId: matchId, selected: true }
          : item
      )
    );
  }, []);

  const handleSave = useCallback(() => {
    const payload = selectedEntries
      .map((entry) => {
        const selectedMatch =
          entry.matches.find((match) => Number(match.id) === Number(entry.selectedMatchId)) || null;

        if (!selectedMatch) return null;

        return {
          id: selectedMatch.id,
          name: selectedMatch.name,
          raspberrySync: {
            directoryName: entry.directoryName,
            directoryPath: entry.directoryPath,
            episodeIds: entry.episodeIds,
            syncedAt: new Date().toISOString(),
          },
        };
      })
      .filter(Boolean);

    onSave?.(payload);
  }, [onSave, selectedEntries]);

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
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.14)",
            padding: 14,
            maxHeight: "84%",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16, marginBottom: 6 }}>
            {strings?.rpiSyncTitle || "Sincronizar con la Raspberry"}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.72)", marginBottom: 12, lineHeight: 19 }}>
            {strings?.rpiSyncSubtitle ||
              "La app busca carpetas en la Raspberry, intenta encontrar la mejor serie en TMDB y te deja ajustar cada resultado antes de guardar."}
          </Text>

          {isLoading ? (
            <View style={{ paddingVertical: 28, alignItems: "center" }}>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: "#fff", marginTop: 10 }}>
                {strings?.rpiSyncLoading || "Leyendo contenido de la Raspberry..."}
              </Text>
            </View>
          ) : error ? (
            <Text style={{ color: "#fff", marginBottom: 12 }}>
              {strings?.rpiSyncError || "No se pudo sincronizar."} {error}
            </Text>
          ) : !items.length ? (
            <Text style={{ color: "rgba(255,255,255,0.72)", paddingVertical: 12 }}>
              {strings?.rpiSyncEmpty || "No se han encontrado carpetas de series en la Raspberry."}
            </Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.directoryPath}
              style={{ maxHeight: 460 }}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
              )}
              renderItem={({ item }) => {
                const selectedMatch =
                  item.matches.find((match) => Number(match.id) === Number(item.selectedMatchId)) ||
                  null;
                const existingItem = selectedMatch
                  ? existingSeriesById.get(Number(selectedMatch.id))
                  : null;
                const canSelect = Boolean(selectedMatch);

                return (
                  <View style={{ paddingVertical: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                      <Pressable
                        disabled={!canSelect}
                        onPress={() => toggleItem(item.directoryPath)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 7,
                          borderWidth: 1,
                          borderColor: canSelect ? "#fff" : "rgba(255,255,255,0.22)",
                          backgroundColor:
                            item.selected && canSelect ? "#22c55e" : "rgba(255,255,255,0.04)",
                          alignItems: "center",
                          justifyContent: "center",
                          marginTop: 2,
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "900" }}>
                          {item.selected && canSelect ? "✓" : ""}
                        </Text>
                      </Pressable>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>
                          {item.directoryName}
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.68)", marginTop: 3 }}>
                          {item.episodeCount} {strings?.episodes || "capítulos"}
                        </Text>

                        {selectedMatch ? (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                              marginTop: 10,
                            }}
                          >
                            <View
                              style={{
                                width: 44,
                                height: 62,
                                borderRadius: 10,
                                overflow: "hidden",
                                backgroundColor: "rgba(255,255,255,0.08)",
                              }}
                            >
                              {selectedMatch.image ? (
                                <Image
                                  source={{ uri: selectedMatch.image }}
                                  style={{ width: "100%", height: "100%" }}
                                  resizeMode="cover"
                                />
                              ) : null}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: "#fff", fontWeight: "700" }}>
                                {selectedMatch.name}
                              </Text>
                              {existingItem?.raspberrySync ? (
                                <Text style={{ color: "#fbbf24", marginTop: 3 }}>
                                  {strings?.rpiSyncAlreadyLinked || "Ya estaba vinculada; se actualizará la sincronización"}
                                </Text>
                              ) : existingItem ? (
                                <Text style={{ color: "#93c5fd", marginTop: 3 }}>
                                  {strings?.rpiSyncExistingSeries || "Ya existe en la biblioteca; se añadirá el vínculo con la Raspberry"}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        ) : (
                          <Text style={{ color: "#fca5a5", marginTop: 10 }}>
                            {strings?.rpiSyncNoMatch || "No se ha encontrado ninguna serie que encaje."}
                          </Text>
                        )}

                        {item.matches.length > 1 ? (
                          <Pressable
                            onPress={() => toggleExpanded(item.directoryPath)}
                            style={({ pressed }) => ({
                              marginTop: 10,
                              alignSelf: "flex-start",
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                              borderRadius: 10,
                              backgroundColor: "rgba(255,255,255,0.08)",
                              opacity: pressed ? 0.8 : 1,
                            })}
                          >
                            <Text style={{ color: "#fff", fontWeight: "700" }}>
                              {item.expanded
                                ? strings?.rpiSyncHideAlternatives || "Ocultar alternativas"
                                : strings?.rpiSyncShowAlternatives || "Ver otras opciones"}
                            </Text>
                          </Pressable>
                        ) : null}

                        {item.expanded ? (
                          <ScrollView style={{ maxHeight: 220, marginTop: 10 }}>
                            {item.matches.map((match) => {
                              const isActive = Number(match.id) === Number(item.selectedMatchId);
                              return (
                                <Pressable
                                  key={`${item.directoryPath}-${match.id}`}
                                  onPress={() => selectMatch(item.directoryPath, match.id)}
                                  style={({ pressed }) => ({
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 10,
                                    paddingVertical: 8,
                                    opacity: pressed ? 0.76 : 1,
                                  })}
                                >
                                  <View
                                    style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: 9,
                                      borderWidth: 1,
                                      borderColor: isActive ? "#22c55e" : "rgba(255,255,255,0.4)",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    <View
                                      style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: 5,
                                        backgroundColor: isActive ? "#22c55e" : "transparent",
                                      }}
                                    />
                                  </View>
                                  <View
                                    style={{
                                      width: 40,
                                      height: 56,
                                      borderRadius: 10,
                                      overflow: "hidden",
                                      backgroundColor: "rgba(255,255,255,0.08)",
                                    }}
                                  >
                                    {match.image ? (
                                      <Image
                                        source={{ uri: match.image }}
                                        style={{ width: "100%", height: "100%" }}
                                        resizeMode="cover"
                                      />
                                    ) : null}
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: "#fff", fontWeight: isActive ? "800" : "600" }}>
                                      {match.name}
                                    </Text>
                                    {match.firstAirDate ? (
                                      <Text style={{ color: "rgba(255,255,255,0.68)", marginTop: 2 }}>
                                        {match.firstAirDate}
                                      </Text>
                                    ) : null}
                                  </View>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        ) : null}
                      </View>
                    </View>
                  </View>
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
              disabled={!canSave}
              onPress={handleSave}
              style={({ pressed }) => ({
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor:
                  !canSave
                    ? "rgba(255,255,255,0.12)"
                    : pressed
                    ? "rgba(34,197,94,0.82)"
                    : "#22c55e",
                opacity: canSave ? 1 : 0.5,
              })}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {strings?.save || "Guardar"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
