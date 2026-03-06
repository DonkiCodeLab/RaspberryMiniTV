import React from "react";
import { View, Text, Image, Animated } from "react-native";
import { resolveAsset } from "../assets/imagesMap";
import { formatSeasonTitle } from "../i18n";

export default function SeasonHeader({
  season,
  maxHeaderH,
  translateY,
  strings,
  seriesName,
}) {
  const seasonImgSrc = resolveAsset(season?.image);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: maxHeaderH,
        transform: [{ translateY }],
        overflow: "hidden",
      }}
    >
      {/* Imagen full width */}
      <View style={{ flex: 1 }}>
        {seasonImgSrc ? (
          <Image
            source={seasonImgSrc}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              flex: 1,
              backgroundColor: "#111",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff" }}>
              {formatSeasonTitle(season?.id, strings)}
            </Text>
          </View>
        )}
      </View>

      {/* Caja de texto sobre la imagen */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <View
          style={{
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 0,
            backgroundColor: "rgba(0,0,0,0.82)",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 26, fontWeight: "900" }}>
            {formatSeasonTitle(season?.id, strings)}
          </Text>
          {seriesName ? (
            <Text style={{ color: "rgba(255,255,255,0.92)", marginTop: 2, fontSize: 13 }}>
              {seriesName}
            </Text>
          ) : null}
          <Text style={{ color: "rgba(255,255,255,0.9)", marginTop: 2, fontSize: 13 }}>
            {(season?.episodeCount ?? season?.episodes?.length ?? 0)} {strings?.episodes || "episodes"}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
