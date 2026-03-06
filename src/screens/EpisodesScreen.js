import React, {
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
  useState,
} from "react";
import {
  View,
  Text,
  StatusBar,
  Animated,
  Platform,
  Dimensions,
  Alert,
  ActivityIndicator,
  Pressable,
} from "react-native";

import EpisodeRow from "../components/EpisodeRow";
import SeasonHeader from "../components/SeasonHeader";
import EpisodeDetailsModal from "../components/EpisodeDetailsModal";
import RaspberryStatusBadge from "../components/RaspberryStatusBadge";
import { getDeviceLanguage, getDeviceLocaleTag, getStrings } from "../i18n";
import { getRaspberryBaseUrl } from "../services/raspberryApi";
import { getTvSeasonEpisodes } from "../services/tmdbApi";

const { height: SCREEN_H } = Dimensions.get("window");

// Ajusta a tu gusto
const MAX_HEADER_H = SCREEN_H * 0.52;
const MIN_HEADER_H = SCREEN_H * 0.15;
const GAP_BELOW_HEADER = 12;

// Convierte el ID del JSON (ej: "7x01") a lo que espera la Raspberry (ej: "S07E01")
function toRaspberryEpisodeId(appEpisodeId) {
  // appEpisodeId típicamente: "7x01", "34x14", etc.
  const m = String(appEpisodeId).match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!m) return null;

  const seasonNum = String(parseInt(m[1], 10)).padStart(2, "0");
  const episodeNum = String(parseInt(m[2], 10)).padStart(2, "0");

  return `S${seasonNum}E${episodeNum}`;
}

export default function EpisodesScreen({ route, navigation }) {
  const {
    seasonId,
    seriesId = 456,
    seriesName = "The Simpsons",
    fallbackRuntime,
  } = route?.params || {};
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  const [season, setSeason] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const language = getDeviceLanguage();
  const localeTag = getDeviceLocaleTag();
  const strings = getStrings(language);

  useLayoutEffect(() => {
    navigation?.setOptions?.({ headerShown: false });
  }, [navigation]);

  const loadSeasonEpisodes = useCallback(async () => {
    if (!seasonId) {
      setError(strings.notFoundSeason || "Season not found.");
      setSeason(null);
      setEpisodes([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const seasonData = await getTvSeasonEpisodes({
        seriesId,
        seasonNumber: seasonId,
        language: localeTag,
        fallbackRuntime,
      });
      setSeason(seasonData);
      setEpisodes(seasonData.episodes || []);
    } catch (err) {
      setError(String(err?.message || err));
      setSeason(null);
      setEpisodes([]);
    } finally {
      setIsLoading(false);
    }
  }, [fallbackRuntime, localeTag, seasonId, seriesId, strings.notFoundSeason]);

  useEffect(() => {
    loadSeasonEpisodes();
  }, [loadSeasonEpisodes]);

  const scrollY = useRef(new Animated.Value(0)).current;
  const detailsAnim = useRef(new Animated.Value(0)).current;

  const openEpisodeDetails = useCallback(
    (episode) => {
      setSelectedEpisode(episode);
      setIsDetailsVisible(true);
      detailsAnim.setValue(0);
      Animated.parallel([
        Animated.timing(detailsAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [detailsAnim]
  );

  const closeEpisodeDetails = useCallback(() => {
    Animated.timing(detailsAnim, {
      toValue: 0,
      duration: 170,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsDetailsVisible(false);
        setSelectedEpisode(null);
      }
    });
  }, [detailsAnim]);

  const playEpisodeOnPi = useCallback(async (raspberryEpisodeId) => {
    const baseUrl = await getRaspberryBaseUrl();
    if (!baseUrl) {
      Alert.alert(
        strings.rpiNotConfigured || "Raspberry not configured",
        strings.rpiNeedQrFirst || "Scan the Raspberry QR first from the RPi status badge."
      );
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${baseUrl}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: raspberryEpisodeId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt}`);
      }

      // Si quieres, puedes leer JSON:
      // const json = await res.json();
      // console.log(json);
    } catch (err) {
      Alert.alert(
        strings.couldNotPlay,
        `Error llamando a ${baseUrl}/play\n\n${String(err)}`
      );
    } finally {
      clearTimeout(timeout);
    }
  }, [strings.couldNotPlay, strings.rpiNeedQrFirst, strings.rpiNotConfigured]);

  const onPressPlay = useCallback(
    async (item) => {
      const raspberryId = toRaspberryEpisodeId(item.id);
      if (!raspberryId) {
        Alert.alert(
          strings.invalidId,
          `No puedo convertir el id "${item.id}" al formato SxxExx.`
        );
        return;
      }

      // Debug útil:
      // console.log("APP id:", item.id, "-> PI id:", raspberryId);

      await playEpisodeOnPi(raspberryId);
    },
    [playEpisodeOnPi, strings.invalidId]
  );

  const detailsCardTranslateY = detailsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });

  const detailsCardScale = detailsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  const detailsCardOpacity = detailsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#111" }}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ color: "#fff", marginTop: 12 }}>{strings.loadingEpisodes}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#111", padding: 20 }}>
        <Text style={{ color: "#fff", fontWeight: "800", marginBottom: 8 }}>
          {strings.tmdbErrorTitle}
        </Text>
        <Text style={{ color: "#fff", textAlign: "center", marginBottom: 14 }}>{error}</Text>
        <Pressable
          onPress={loadSeasonEpisodes}
          style={{
            backgroundColor: "rgba(255,255,255,0.12)",
            borderColor: "rgba(255,255,255,0.6)",
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>{strings.retry}</Text>
        </Pressable>
      </View>
    );
  }

  if (!season) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <Text>{strings.notFoundSeason}</Text>
      </View>
    );
  }

  const bgColor = season.avgColor || "#111";
  const maxTranslate = MAX_HEADER_H - MIN_HEADER_H;

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, maxTranslate],
    outputRange: [0, -maxTranslate],
    extrapolate: "clamp",
  });

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <StatusBar barStyle="light-content" />
      <RaspberryStatusBadge strings={strings} />

      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.22)" }}>
        {/* LISTA */}
        <Animated.FlatList
          data={episodes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EpisodeRow
              item={item}
              onOpenDetails={() => openEpisodeDetails(item)}
              strings={strings}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingTop: MAX_HEADER_H + GAP_BELOW_HEADER,
            paddingHorizontal: 16,
            paddingBottom: 28,
          }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
        />

        {/* HEADER */}
        <SeasonHeader
          season={season}
          maxHeaderH={MAX_HEADER_H}
          translateY={headerTranslateY}
          strings={strings}
          seriesName={seriesName}
        />

        {/* “Safe area” mínimo arriba para iOS notch (sin libs) */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: Platform.OS === "ios" ? 12 : 0,
          }}
        />
      </View>

      <EpisodeDetailsModal
        visible={isDetailsVisible}
        episode={selectedEpisode}
        seasonNumber={season?.id}
        seriesName={seriesName}
        strings={strings}
        onClose={closeEpisodeDetails}
        onPlay={onPressPlay}
        cardOpacity={detailsCardOpacity}
        cardTranslateY={detailsCardTranslateY}
        cardScale={detailsCardScale}
      />
    </View>
  );
}
