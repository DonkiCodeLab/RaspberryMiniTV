import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { resolveAsset } from "../assets/imagesMap";
import {
  formatSeasonTitle,
  getDeviceLanguage,
  getDeviceLocaleTag,
  getStrings,
} from "../i18n";
import RaspberryStatusBadge from "../components/RaspberryStatusBadge";
import { getAvailableSeries, getTvSeriesById } from "../services/tmdbApi";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const NUM_COLUMNS = 2;
const GAP = 14;
const H_PADDING = 16;

// Header “10% -> 5%” (aprox)
const MAX_HEADER_H = SCREEN_H * 0.24;
const MIN_HEADER_H = SCREEN_H * 0.12;

// Cuánto scroll hace falta para completar la animación
const COLLAPSE_DISTANCE = 180;

export default function SeasonsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const language = getDeviceLanguage();
  const localeTag = getDeviceLocaleTag();
  const strings = getStrings(language);
  const [selectedSeriesId, setSelectedSeriesId] = useState(
    getAvailableSeries()[0]?.id || 456
  );
  const [seriesName, setSeriesName] = useState(getAvailableSeries()[0]?.name || "");
  const [fallbackRuntime, setFallbackRuntime] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const availableSeries = useMemo(() => getAvailableSeries(), []);

  const itemWidth = useMemo(() => {
    return (SCREEN_W - H_PADDING * 2 - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
  }, []);

  const scrollY = useRef(new Animated.Value(0)).current;

  const headerHeight = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [MAX_HEADER_H, MIN_HEADER_H],
    extrapolate: "clamp",
  });

  const logoScale = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [1, 0.93],
    extrapolate: "clamp",
  });

  const loadSeries = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const tvData = await getTvSeriesById(selectedSeriesId, localeTag);
      setSeasons(tvData.seasons);
      setSeriesName(tvData.name);
      setFallbackRuntime(tvData.fallbackRuntime);
    } catch (err) {
      setError(String(err?.message || err));
      setSeasons([]);
    } finally {
      setIsLoading(false);
    }
  }, [localeTag, selectedSeriesId]);

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
            seriesId: selectedSeriesId,
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
            aspectRatio: 1,
            padding: 10,
            backgroundColor: "rgba(255,255,255,0.08)",
          }}
        >
          {imgSrc ? (
            <Image
              source={imgSrc}
              style={{ width: "100%", height: "100%", borderRadius: 14 }}
              resizeMode="contain"
            />
          ) : (
            <View
              style={{
                flex: 1,
                borderRadius: 14,
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
        <RaspberryStatusBadge strings={strings} topOffset={14} />

        {/* Header animado */}
        <Animated.View
          style={{
            height: headerHeight,
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: insets.top,
            paddingLeft: 12,
            paddingRight: 112,
          }}
        >
          <Animated.Image
            source={require("../../assets/simpsons/logos/logo_simpsons.png")}
            resizeMode="contain"
            style={{
              width: "100%",
              height: "80%",
              transform: [{ scale: logoScale }],
            }}
          />
        </Animated.View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 16,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
            {strings.series}:
          </Text>
          <View style={{ flexDirection: "row", gap: 8, flexShrink: 1 }}>
            {availableSeries.map((series) => {
              const isActive = series.id === selectedSeriesId;
              return (
                <Pressable
                  key={series.id}
                  onPress={() => setSelectedSeriesId(series.id)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.6)",
                    backgroundColor: isActive
                      ? "rgba(0,0,0,0.5)"
                      : "rgba(255,255,255,0.15)",
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                    {series.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Lista animada (para capturar el scrollY) */}
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
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: false } // height no puede con native driver
            )}
          />
        )}
      </View>
    </ImageBackground>
  );
}
