import React from "react";
import { Modal, View, Text, Pressable, Animated, ScrollView, Image } from "react-native";
import { resolveAsset } from "../assets/imagesMap";
import { formatSeasonTitle } from "../i18n";

export default function EpisodeDetailsModal({
  visible,
  episode,
  seasonNumber,
  seriesName,
  strings,
  onClose,
  onPlay,
  cardOpacity,
  cardTranslateY,
  cardScale,
}) {
  const episodeImg = episode ? resolveAsset(episode.image) : null;
  const durationLabel = episode?.duration
    ? `${episode.duration} ${strings?.minutes || "minutes"}`
    : strings?.unknown || "unknown";
  const airDateLabel = episode?.airDate || strings?.unknown || "unknown";

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />

        <Animated.View
          style={{
            width: "92%",
            height: "84%",
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.90)",
            opacity: cardOpacity,
            transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
          }}
        >
          <View style={{ position: "absolute", top: 12, right: 14, zIndex: 10 }}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.95)",
                borderWidth: 1,
                borderColor: "rgba(0,0,0,0.12)",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: "#111", fontSize: 20, fontWeight: "700" }}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 18,
            }}
            showsVerticalScrollIndicator={false}
          >
            {episode && (
              <>
                <View
                  style={{
                    marginHorizontal: -14,
                    marginTop: -12,
                    padding: 12,
                    backgroundColor: "#000",
                    marginBottom: 14,
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 24,
                      fontWeight: "900",
                      marginBottom: 10,
                    }}
                  >
                    {formatSeasonTitle(seasonNumber, strings)}
                  </Text>
                  {seriesName ? (
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.9)",
                        fontSize: 13,
                        fontWeight: "700",
                        marginBottom: 8,
                      }}
                    >
                      {seriesName}
                    </Text>
                  ) : null}

                  {episodeImg ? (
                    <Image
                      source={episodeImg}
                      style={{
                        width: "100%",
                        height: 190,
                        borderRadius: 0,
                      }}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>

                <Text
                  style={{
                    color: "#121212",
                    fontSize: 19,
                    fontWeight: "900",
                    lineHeight: 24,
                  }}
                >
                  {(strings?.episodePrefix || "Episode")} {episode.episodeNumber}:
                </Text>
                <Text
                  style={{
                    color: "#121212",
                    fontSize: 19,
                    fontWeight: "900",
                    lineHeight: 24,
                    marginTop: 2,
                  }}
                >
                  {episode.title}
                </Text>

                <Text style={{ color: "#222", fontSize: 15, marginTop: 12 }}>
                  ⏱ <Text style={{ fontWeight: "800" }}>{strings?.duration || "Duration"}:</Text>{" "}
                  {durationLabel}
                </Text>
                <Text style={{ color: "#222", fontSize: 15, marginTop: 12 }}>
                  📅 <Text style={{ fontWeight: "800" }}>{strings?.airDate || "Aired"}:</Text>{" "}
                  {airDateLabel}
                </Text>
                <Text style={{ color: "#222", fontSize: 15, marginTop: 12 }}>
                  ⭐ <Text style={{ fontWeight: "800" }}>{strings?.rating || "Rating"}:</Text>{" "}
                  {episode.voteAverage ? episode.voteAverage.toFixed(1) : "-"}
                </Text>

                <Text
                  style={{
                    color: "#151515",
                    fontSize: 16,
                    marginTop: 14,
                    lineHeight: 23,
                  }}
                >
                  📝 <Text style={{ fontWeight: "800" }}>{strings?.synopsisLabel || "Synopsis"}:</Text>{" "}
                  {episode.synopsis || strings?.noSynopsis || "Synopsis not available."}
                </Text>
              </>
            )}
          </ScrollView>

          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Pressable
              disabled={!episode}
              onPress={() => episode && onPlay(episode)}
              style={({ pressed }) => ({
                height: 52,
                borderRadius: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#111",
                opacity: pressed ? 0.86 : 1,
              })}
            >
              <Image
                source={require("../../assets/tele_green_1.png")}
                style={{ width: 40, height: 40, marginRight: 8 }}
                resizeMode="contain"
              />
              <Text style={{ color: "#fff", fontSize: 17, fontWeight: "800" }}>
                {strings?.playSimpsonsTv || "Reproducir Simpsons TV"}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
