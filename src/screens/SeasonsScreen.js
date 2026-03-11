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
import { getAvailableSeries, getTvSeriesFromOption } from "../services/tmdbApi";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const NUM_COLUMNS = 2;
const GAP = 14;
const H_PADDING = 16;
const HEADER_PLACEHOLDER_H = SCREEN_H * 0.24;
const HEADER_HORIZONTAL_PADDING = 16;
const HEADER_BADGE_GAP = 12;
const HEADER_TOP_PADDING = 34;
const HEADER_BOTTOM_PADDING = 10;
const HEADER_BADGE_LEFT_SHIFT = SCREEN_W * 0.05;
const CARTELL_ASPECT_RATIO = 711 / 382;

export default function SeasonsScreen({ navigation }) {
  const language = getDeviceLanguage();
  const localeTag = getDeviceLocaleTag();
  const strings = getStrings(language);
  const availableSeries = useMemo(() => getAvailableSeries(), []);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState(
    availableSeries[0]?.key || "simpsons"
  );
  const selectedSeries =
    availableSeries.find((series) => series.key === selectedSeriesKey) ||
    availableSeries[0];
  const [resolvedSeriesId, setResolvedSeriesId] = useState(selectedSeries?.id || 456);
  const [seriesName, setSeriesName] = useState(selectedSeries?.name || "");
  const [seriesHeroImage, setSeriesHeroImage] = useState(null);
  const [fallbackRuntime, setFallbackRuntime] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSeriesSelectorVisible, setIsSeriesSelectorVisible] = useState(false);

  const itemWidth = useMemo(() => {
    return (SCREEN_W - H_PADDING * 2 - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
  }, []);

  const loadSeries = useCallback(async () => {
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
              height: "100%",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                flex: 1,
                height: "100%",
              }}
            >
              <View
                style={{
                  width: "100%",
                  height: "100%",
                  aspectRatio: CARTELL_ASPECT_RATIO,
                  alignSelf: "flex-start",
                }}
              >
                <MaskedView
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                  maskElement={
                    <View
                      style={{
                        flex: 1,
                        justifyContent: "center",
                        alignItems: "stretch",
                        backgroundColor: "transparent",
                      }}
                    >
                      <Image
                        source={require("../../assets/cartell_main_mask.png")}
                        style={{
                          width: "100%",
                          height: "100%",
                          tintColor: "#000",
                        }}
                        resizeMode="contain"
                      />
                    </View>
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
              </View>
            </View>
            <View style={{ width: HEADER_BADGE_GAP }} />
            <View style={{ marginLeft: -HEADER_BADGE_LEFT_SHIFT }}>
              <RaspberryStatusBadge strings={strings} absolute={false} />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13, marginBottom: 6 }}>
            {strings.selectSeries || strings.series}
          </Text>
          <Pressable
            onPress={() => setIsSeriesSelectorVisible(true)}
            style={({ pressed }) => ({
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
        </View>

        {/* Lista de temporadas */}
        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={{ color: "#fff", marginTop: 10 }}>{strings.loadingSeasons}</Text>
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
    </ImageBackground>
  );
}
