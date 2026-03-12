import React, { useMemo, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  ImageBackground,
  Dimensions,
  StatusBar,
  Animated,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";

import { resolveAsset } from "../assets/imagesMap";
import {
  formatSeasonTitle,
  getDeviceLanguage,
  getDeviceLocaleTag,
  getStrings,
} from "../i18n";
import RaspberryStatusBadge from "../components/RaspberryStatusBadge";
import AddSeriesDialog from "../components/AddSeriesDialog";
import SeriesOptionsDialog from "../components/SeriesOptionsDialog";
import {
  addSeriesToLibrary,
  loadSeriesLibrary,
  removeSeriesFromLibrary,
  renameSeriesInLibrary,
} from "../services/seriesLibrary";
import { getTvSeriesFromOption } from "../services/tmdbApi";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const NUM_COLUMNS = 2;
const GAP = 14;
const H_PADDING = 16;
const HEADER_HORIZONTAL_PADDING = 16;
const HEADER_TOP_PADDING = 52;
const HEADER_BOTTOM_PADDING = 10;
const HEADER_BASE_WIDTH = 714;
const HEADER_BASE_HEIGHT = 228;
const BADGE_ZONE_X = 523;
const BADGE_ZONE_Y = 19;
const BADGE_ZONE_WIDTH = 191;
const BADGE_ZONE_HEIGHT = 190;
const HEADER_SCENE_ASPECT_RATIO = HEADER_BASE_WIDTH / HEADER_BASE_HEIGHT;
const HEADER_SCENE_WIDTH = SCREEN_W - HEADER_HORIZONTAL_PADDING * 2;
const HEADER_SCENE_HEIGHT = HEADER_SCENE_WIDTH / HEADER_SCENE_ASPECT_RATIO;
const HEADER_PLACEHOLDER_H =
  HEADER_TOP_PADDING + HEADER_SCENE_HEIGHT + HEADER_BOTTOM_PADDING;
const BADGE_ZONE_WIDTH_SCALED =
  HEADER_SCENE_WIDTH * (BADGE_ZONE_WIDTH / HEADER_BASE_WIDTH);
const BADGE_ZONE_HEIGHT_SCALED =
  HEADER_SCENE_HEIGHT * (BADGE_ZONE_HEIGHT / HEADER_BASE_HEIGHT);
const BADGE_SIZE = Math.min(BADGE_ZONE_WIDTH_SCALED, BADGE_ZONE_HEIGHT_SCALED) * 0.9;
const BADGE_LEFT =
  HEADER_SCENE_WIDTH * (BADGE_ZONE_X / HEADER_BASE_WIDTH) +
  (BADGE_ZONE_WIDTH_SCALED - BADGE_SIZE) / 2;
const BADGE_TOP =
  HEADER_SCENE_HEIGHT * (BADGE_ZONE_Y / HEADER_BASE_HEIGHT) +
  (BADGE_ZONE_HEIGHT_SCALED - BADGE_SIZE) / 2;

export default function SeasonsScreen({ navigation }) {
  const language = getDeviceLanguage();
  const localeTag = getDeviceLocaleTag();
  const strings = getStrings(language);
  const [availableSeries, setAvailableSeries] = useState([]);
  const [isSeriesLibraryLoading, setIsSeriesLibraryLoading] = useState(true);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState(null);
  const selectedSeries =
    availableSeries.find((series) => series.key === selectedSeriesKey) ||
    null;
  const [resolvedSeriesId, setResolvedSeriesId] = useState(selectedSeries?.id || 456);
  const [seriesName, setSeriesName] = useState(selectedSeries?.name || "");
  const [seriesHeroImage, setSeriesHeroImage] = useState(null);
  const [fallbackRuntime, setFallbackRuntime] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSeriesSelectorVisible, setIsSeriesSelectorVisible] = useState(false);
  const [isAddSeriesVisible, setIsAddSeriesVisible] = useState(false);
  const [isSeriesOptionsVisible, setIsSeriesOptionsVisible] = useState(false);

  const itemWidth = useMemo(() => {
    return (SCREEN_W - H_PADDING * 2 - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
  }, []);

  const syncSeriesLibrary = useCallback((nextSeries) => {
    setAvailableSeries(nextSeries);
    setSelectedSeriesKey((currentKey) => {
      if (!nextSeries.length) return null;
      if (currentKey && nextSeries.some((series) => series.key === currentKey)) {
        return currentKey;
      }
      return nextSeries[0].key;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const storedSeries = await loadSeriesLibrary();
        if (!isMounted) return;
        syncSeriesLibrary(storedSeries);
      } finally {
        if (isMounted) setIsSeriesLibraryLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [syncSeriesLibrary]);

  const loadSeries = useCallback(async () => {
    if (!selectedSeries) {
      setSeasons([]);
      setSeriesName("");
      setSeriesHeroImage(null);
      setFallbackRuntime(null);
      setResolvedSeriesId(null);
      setError("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const tvData = await getTvSeriesFromOption(selectedSeries, localeTag);
      setSeasons(tvData.seasons);
      setSeriesName(tvData.name);
      setSeriesHeroImage(tvData.heroImage || null);
      setFallbackRuntime(tvData.fallbackRuntime);
      setResolvedSeriesId(tvData.id);
    } catch (err) {
      setError(String(err?.message || err));
      setSeasons([]);
      setSeriesHeroImage(null);
    } finally {
      setIsLoading(false);
    }
  }, [localeTag, selectedSeries]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

  const handleAddSeries = useCallback(
    async (seriesResult) => {
      try {
        const nextSeries = await addSeriesToLibrary({
          id: seriesResult.id,
          name: seriesResult.name,
        });
        syncSeriesLibrary(nextSeries);
        setSelectedSeriesKey(
          nextSeries.find((series) => Number(series.id) === Number(seriesResult.id))?.key ||
            nextSeries[0]?.key ||
            null
        );
        setIsAddSeriesVisible(false);
      } catch (err) {
        Alert.alert(strings.tmdbErrorTitle, String(err?.message || err));
      }
    },
    [strings.tmdbErrorTitle, syncSeriesLibrary]
  );

  const handleRenameSeries = useCallback(
    async (series, nextName) => {
      try {
        const nextSeries = await renameSeriesInLibrary(series?.key, nextName);
        syncSeriesLibrary(nextSeries);
        setIsSeriesOptionsVisible(false);
      } catch (err) {
        Alert.alert(strings.tmdbErrorTitle, String(err?.message || err));
      }
    },
    [strings.tmdbErrorTitle, syncSeriesLibrary]
  );

  const handleDeleteSeries = useCallback(
    async (series) => {
      try {
        const nextSeries = await removeSeriesFromLibrary(series?.key);
        syncSeriesLibrary(nextSeries);
        setIsSeriesOptionsVisible(false);
      } catch (err) {
        Alert.alert(strings.tmdbErrorTitle, String(err?.message || err));
      }
    },
    [strings.tmdbErrorTitle, syncSeriesLibrary]
  );

  const renderItem = ({ item }) => {
    const imgSrc = resolveAsset(item.image);

    return (
      <Pressable
        onPress={() =>
          navigation.navigate("Episodes", {
            seasonId: item.id,
            seriesId: resolvedSeriesId,
            seriesName,
            fallbackRuntime,
          })
        }
        style={({ pressed }) => ({
          width: itemWidth,
          borderRadius: 20,
          overflow: "hidden",
          transform: [{ scale: pressed ? 0.97 : 1 }],
          opacity: pressed ? 0.9 : 1,
          backgroundColor: "rgba(0,0,0,0.55)",
        })}
      >
        {/* Imagen temporada */}
        <View
          style={{
            width: "100%",
            height: itemWidth * 1.28,
            backgroundColor: "rgba(255,255,255,0.08)",
          }}
        >
          {imgSrc ? (
            <Image
              source={imgSrc}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#222",
              }}
            >
              <Text style={{ color: "#bbb", fontSize: 12 }}>
                {strings.noImage}
              </Text>
            </View>
          )}
        </View>

        {/* Texto */}
        <View style={{ padding: 12 }}>
          <Text
            style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}
            numberOfLines={1}
          >
            {formatSeasonTitle(item.id, strings)}
          </Text>
          <Text style={{ color: "#e0e0e0", marginTop: 4, fontSize: 12 }}>
            {item.episodeCount || item.episodes?.length || 0} {strings.episodes}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <ImageBackground
      source={require("../../assets/simpsons/backgrounds/simpsons_clouds.jpg")}
      resizeMode="cover"
      style={{ flex: 1 }}
    >
      <StatusBar barStyle="light-content" />

      {/* Overlay para contraste */}
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }}>
        <View
          style={{
            height: HEADER_PLACEHOLDER_H,
            paddingHorizontal: HEADER_HORIZONTAL_PADDING,
            paddingTop: HEADER_TOP_PADDING,
            paddingBottom: HEADER_BOTTOM_PADDING,
            justifyContent: "flex-start",
          }}
        >
          <View
            style={{
              width: "100%",
              height: HEADER_SCENE_HEIGHT,
              position: "relative",
            }}
          >
            <MaskedView
              style={{
                width: "100%",
                height: "100%",
              }}
              maskElement={
                <Image
                  source={require("../../assets/cartell_base_black_mask.png")}
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                  resizeMode="contain"
                />
              }
            >
              {seriesHeroImage ? (
                <Image
                  source={{ uri: seriesHeroImage }}
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(0,0,0,0.35)",
                  }}
                />
              )}
            </MaskedView>
            <View
              style={{
                position: "absolute",
                left: BADGE_LEFT,
                top: BADGE_TOP,
              }}
            >
              <RaspberryStatusBadge
                strings={strings}
                absolute={false}
                size={BADGE_SIZE}
              />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13, marginBottom: 6 }}>
            {strings.selectSeries || strings.series}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              onPress={() => setIsSeriesSelectorVisible(true)}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.65)",
                backgroundColor: "rgba(0,0,0,0.45)",
                paddingHorizontal: 12,
                paddingVertical: 11,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700", flex: 1 }}>
                {selectedSeries?.name || "-"}
              </Text>
              <Text style={{ color: "#fff", fontSize: 16, marginLeft: 8 }}>▾</Text>
            </Pressable>

            {selectedSeries ? (
              <Pressable
                onPress={() => setIsSeriesOptionsVisible(true)}
                style={({ pressed }) => ({
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.65)",
                  backgroundColor: "rgba(0,0,0,0.45)",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>⋯</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => setIsAddSeriesVisible(true)}
              style={({ pressed }) => ({
                width: 46,
                height: 46,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.65)",
                backgroundColor: "rgba(0,0,0,0.45)",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>+</Text>
            </Pressable>
          </View>
        </View>

        {/* Lista de temporadas */}
        {isSeriesLibraryLoading || isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={{ color: "#fff", marginTop: 10 }}>{strings.loadingSeasons}</Text>
          </View>
        ) : !selectedSeries ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Text style={{ color: "#fff", fontWeight: "800", marginBottom: 8 }}>
              {strings.noSeriesSelected}
            </Text>
            <Pressable
              onPress={() => setIsAddSeriesVisible(true)}
              style={{
                backgroundColor: "rgba(0,0,0,0.45)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.6)",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>{strings.addYourFirstSeries}</Text>
            </Pressable>
          </View>
        ) : error ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
            <Text style={{ color: "#fff", fontWeight: "800", marginBottom: 8 }}>
              {strings.tmdbErrorTitle}
            </Text>
            <Text style={{ color: "#fff", textAlign: "center", marginBottom: 12 }}>
              {error}
            </Text>
            <Pressable
              onPress={loadSeries}
              style={{
                backgroundColor: "rgba(0,0,0,0.45)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.6)",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>{strings.retry}</Text>
            </Pressable>
          </View>
        ) : (
          <Animated.FlatList
            contentContainerStyle={{
              paddingHorizontal: H_PADDING,
              paddingBottom: 24,
            }}
            data={seasons}
            keyExtractor={(item) => String(item.id)}
            numColumns={NUM_COLUMNS}
            columnWrapperStyle={{ gap: GAP, marginBottom: GAP }}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <Modal
        visible={isSeriesSelectorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSeriesSelectorVisible(false)}
      >
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
            onPress={() => setIsSeriesSelectorVisible(false)}
          />
          <View
            style={{
              backgroundColor: "rgba(18,18,18,0.97)",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.15)",
              padding: 12,
              maxHeight: SCREEN_H * 0.6,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16, marginBottom: 8 }}>
              {strings.selectSeries || strings.series}
            </Text>
            <FlatList
              data={availableSeries}
              keyExtractor={(item) => item.key}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.12)" }} />
              )}
              renderItem={({ item }) => {
                const isActive = item.key === selectedSeriesKey;
                return (
                  <Pressable
                    onPress={() => {
                      setSelectedSeriesKey(item.key);
                      setIsSeriesSelectorVisible(false);
                    }}
                    style={({ pressed }) => ({
                      paddingVertical: 12,
                      paddingHorizontal: 6,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Text style={{ color: "#fff", fontSize: 15, fontWeight: isActive ? "800" : "600" }}>
                      {item.name}
                    </Text>
                    <Text style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 16 }}>
                      {isActive ? "✓" : ""}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <AddSeriesDialog
        visible={isAddSeriesVisible}
        strings={strings}
        localeTag={localeTag}
        existingSeriesIds={availableSeries.map((series) => series.id)}
        onClose={() => setIsAddSeriesVisible(false)}
        onAddSeries={handleAddSeries}
      />

      <SeriesOptionsDialog
        visible={isSeriesOptionsVisible && Boolean(selectedSeries)}
        strings={strings}
        series={selectedSeries}
        onClose={() => setIsSeriesOptionsVisible(false)}
        onRenameSeries={handleRenameSeries}
        onDeleteSeries={handleDeleteSeries}
      />
    </ImageBackground>
  );
}
