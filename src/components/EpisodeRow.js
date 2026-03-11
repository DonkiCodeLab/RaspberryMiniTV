import React from "react";
import { View, Text, Image, Pressable } from "react-native";
import { resolveAsset } from "../assets/imagesMap";

export default function EpisodeRow({ item, onOpenDetails, strings }) {
  const imgSrc = resolveAsset(item.image);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        borderRadius: 14,
        backgroundColor: "rgba(0,0,0,0.74)",
      }}
    >
      {imgSrc ? (
        <Image
          source={imgSrc}
          style={{ width: 96, height: 54, borderRadius: 10, marginRight: 12 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: 96,
            height: 54,
            borderRadius: 10,
            marginRight: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#222",
          }}
        >
          <Text style={{ color: "#bbb", fontSize: 12 }}>
            {strings?.noImage || "No img"}
          </Text>
        </View>
      )}

      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={{ fontSize: 16, color: "#fff", fontWeight: "700" }}>
          {item.episodeNumber}. {item.title}
        </Text>
      </View>

      <Pressable
        onPress={onOpenDetails}
        accessibilityRole="button"
        accessibilityLabel={`${strings?.viewDetails || "View details for"} ${item.title}`}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.18)",
          opacity: pressed ? 0.7 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>
          ›
        </Text>
      </Pressable>
    </View>
  );
}
