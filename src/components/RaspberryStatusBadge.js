import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, Pressable, Modal, Animated, Alert, Image, Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  stopRaspberryPlayback,
  volumeDownRaspberry,
  volumeUpRaspberry,
} from "../services/raspberryApi";
import { useRaspberryStatus } from "../context/RaspberryStatusContext";

const STOP_ICON = require("../../assets/stop.png");
const SYNCHRONIZE_ICON = require("../../assets/synchronize.png");
const VOLUME_DOWN_ICON = require("../../assets/volume_down.png");
const VOLUME_UP_ICON = require("../../assets/volume_up.png");
const YOUTUBE_ICON = require("../../assets/youtube_icon.png");
const YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@donkicodelab";
const YOUTUBE_APP_URL = "vnd.youtube://www.youtube.com/@donkicodelab";

function statusColor(status) {
  if (status === "green") return "#22c55e";
  if (status === "yellow") return "#facc15";
  return "#ef4444";
}

export default function RaspberryStatusBadge({
  strings,
  size = 104,
  scale = 1,
  topOffset = 0,
  absolute = true,
  rightOffset = 16,
  onRequestSynchronize,
}) {
  const { health, refreshHealth, baseUrl, updateBaseUrl } = useRaspberryStatus();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [visible, setVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const scannerLockRef = useRef(false);
  const [stopping, setStopping] = useState(false);
  const [changingVolume, setChangingVolume] = useState(false);
  const [tvFrame, setTvFrame] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const hoverAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Parpadeo de tele cada segundo para estados con 2 frames.
    const intervalId = setInterval(() => {
      setTvFrame((prev) => (prev === 0 ? 1 : 0));
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const openModal = useCallback(() => {
    setVisible(true);
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const closeModal = useCallback((onClosed) => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisible(false);
        if (typeof onClosed === "function") {
          onClosed();
        }
      }
    });
  }, [anim]);

  const onStop = useCallback(async () => {
    setStopping(true);
    try {
      await stopRaspberryPlayback();
      await refreshHealth();
    } catch (err) {
      Alert.alert(
        strings?.rpiStopErrorTitle || "Stop failed",
        String(err)
      );
    } finally {
      setStopping(false);
    }
  }, [refreshHealth, strings?.rpiStopErrorTitle]);

  const isRaspberryConnected = health.status === "green";

  const onVolumeDown = useCallback(async () => {
    setChangingVolume(true);
    try {
      await volumeDownRaspberry();
      await refreshHealth();
    } catch (err) {
      Alert.alert(strings?.rpiVolumeErrorTitle || "Volume error", String(err));
    } finally {
      setChangingVolume(false);
    }
  }, [refreshHealth, strings?.rpiVolumeErrorTitle]);

  const onVolumeUp = useCallback(async () => {
    setChangingVolume(true);
    try {
      await volumeUpRaspberry();
      await refreshHealth();
    } catch (err) {
      Alert.alert(strings?.rpiVolumeErrorTitle || "Volume error", String(err));
    } finally {
      setChangingVolume(false);
    }
  }, [refreshHealth, strings?.rpiVolumeErrorTitle]);

  const onSynchronize = useCallback(async () => {
    try {
      if (typeof onRequestSynchronize === "function") {
        closeModal(() => {
          onRequestSynchronize();
        });
        return;
      }

      await refreshHealth();
    } catch (err) {
      Alert.alert(strings?.rpiRefresh || "Refresh", String(err));
    }
  }, [closeModal, onRequestSynchronize, refreshHealth, strings?.rpiRefresh]);

  const onOpenYoutube = useCallback(async () => {
    try {
      const canOpenYoutubeApp = await Linking.canOpenURL(YOUTUBE_APP_URL);
      await Linking.openURL(canOpenYoutubeApp ? YOUTUBE_APP_URL : YOUTUBE_CHANNEL_URL);
    } catch (err) {
      Alert.alert("YouTube", String(err));
    }
  }, []);

  const openScanner = useCallback(async () => {
    const current = cameraPermission?.granted;
    if (!current) {
      const req = await requestCameraPermission();
      if (!req?.granted) {
        Alert.alert(
          strings?.rpiQrPermissionTitle || "Camera permission required",
          strings?.rpiQrPermissionMessage || "Allow camera access to scan the Raspberry QR."
        );
        return;
      }
    }

    // iOS falla a veces al presentar un Modal encima de otro.
    // Cerramos primero el modal de estado y luego abrimos el escáner.
    Animated.timing(anim, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setScannerLocked(false);
      scannerLockRef.current = false;
      setScannerVisible(true);
    });
  }, [
    anim,
    cameraPermission?.granted,
    requestCameraPermission,
    strings?.rpiQrPermissionMessage,
    strings?.rpiQrPermissionTitle,
  ]);

  const closeScanner = useCallback(() => {
    setScannerVisible(false);
    setScannerLocked(false);
    scannerLockRef.current = false;
  }, []);

  const onScanQr = useCallback(
    async ({ data }) => {
      if (scannerLockRef.current) return;
      scannerLockRef.current = true;
      setScannerLocked(true);

      try {
        const normalized = await updateBaseUrl(data);
        closeScanner();
        Alert.alert(
          strings?.rpiQrSavedTitle || "Raspberry updated",
          `${strings?.rpiBaseUrlLabel || "URL"}: ${normalized}`
        );
      } catch (_err) {
        scannerLockRef.current = false;
        setScannerLocked(false);
        Alert.alert(
          strings?.rpiQrInvalidTitle || "Invalid QR",
          strings?.rpiQrInvalidMessage || "The QR must contain a valid URL like http://10.1.35.27:5050"
        );
      }
    },
    [
      closeScanner,
      strings?.rpiBaseUrlLabel,
      strings?.rpiQrInvalidMessage,
      strings?.rpiQrInvalidTitle,
      strings?.rpiQrSavedTitle,
      updateBaseUrl,
    ]
  );

  const cardTranslateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });

  const cardOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const badgeSize = size;
  const tvSize = badgeSize * 0.81;
  const badgeScale = scale;
  const badgeTvScale = hoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.34],
  });
  const badgeTvTranslateY = hoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });
  const badgeTvRotate = hoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "-4deg"],
  });

  const stateLabel =
    health.status === "green"
      ? strings?.rpiConnected || "Connected"
      : health.status === "yellow"
      ? strings?.rpiDegraded || "Degraded"
      : strings?.rpiDisconnected || "Sin conexión";
  const modalTvSource =
    health.status === "green"
      ? tvFrame === 0
        ? require("../../assets/tele_green_1.png")
        : require("../../assets/tele_green_2.png")
      : tvFrame === 0
      ? require("../../assets/tele_red_1.png")
      : require("../../assets/tele_red_2.png");

  return (
    <>
      <Animated.View
        style={{
          position: absolute ? "absolute" : "relative",
          top: absolute ? insets.top + topOffset : undefined,
          right: absolute ? rightOffset : undefined,
          zIndex: 30,
          transform: [{ scale: badgeScale }],
        }}
      >
        <Pressable
          onPress={openModal}
          onHoverIn={() => {
            Animated.spring(hoverAnim, {
              toValue: 1,
              tension: 180,
              friction: 12,
              useNativeDriver: true,
            }).start();
          }}
          onHoverOut={() => {
            Animated.spring(hoverAnim, {
              toValue: 0,
              tension: 180,
              friction: 12,
              useNativeDriver: true,
            }).start();
          }}
          style={({ pressed }) => ({
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            alignItems: "center",
            justifyContent: "center",
            overflow: "visible",
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: "rgba(255,255,255,0.50)",
              borderWidth: 2,
              borderColor: health.status === "green" ? "#22c55e" : "#ef4444",
              shadowColor: health.status === "green" ? "#22c55e" : "#ef4444",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: health.status === "green" ? 0.24 : 0.2,
              shadowRadius: 12,
              elevation: health.status === "green" ? 10 : 8,
            }}
          />
          <Animated.Image
            source={
              health.status === "green"
                ? tvFrame === 0
                  ? require("../../assets/tele_green_1.png")
                  : require("../../assets/tele_green_2.png")
                : tvFrame === 0
                ? require("../../assets/tele_red_1.png")
                : require("../../assets/tele_red_2.png")
            }
            style={{
              width: tvSize,
              height: tvSize,
              marginTop: 0,
              transform: [
                { translateY: badgeTvTranslateY },
                { rotate: badgeTvRotate },
                { scale: badgeTvScale },
              ],
            }}
            resizeMode="contain"
          />
        </Pressable>
      </Animated.View>

      <Modal visible={visible} transparent animationType="none" onRequestClose={closeModal}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Pressable
            onPress={closeModal}
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
              width: "90%",
              opacity: cardOpacity,
              transform: [{ translateY: cardTranslateY }],
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 292,
                height: 292,
                borderRadius: 146,
                backgroundColor: "#ffffff",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: -48,
                zIndex: 2,
              }}
            >
              <Image
                source={modalTvSource}
                style={{ width: 252, height: 252 }}
                resizeMode="contain"
              />
            </View>
            <View
              style={{
                width: "100%",
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                borderBottomLeftRadius: 22,
                borderBottomRightRadius: 22,
                backgroundColor: "#ffffff",
                opacity: 1,
                padding: 16,
                paddingTop: 42,
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: "#111", fontSize: 20, fontWeight: "900" }}>
                  Raspberry Pi TV
                </Text>
                <Pressable
                  onPress={closeModal}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(0,0,0,0.12)",
                  }}
                >
                  <Text style={{ color: "#111", fontSize: 22, fontWeight: "800" }}>×</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: statusColor(health.status),
                    marginRight: 8,
                  }}
                />
                <Text style={{ color: "#111", fontSize: 15, fontWeight: "700" }}>
                  {stateLabel}
                </Text>
              </View>

              <Text style={{ color: "#111", fontSize: 14, marginBottom: 14 }}>
                <Text style={{ fontWeight: "800" }}>
                  {strings?.rpiPlayingTitle || "Reproduciendo"}:
                </Text>{" "}
                {health.playing || "-"}
              </Text>
              <Text style={{ color: "#111", fontSize: 13, marginBottom: 14 }}>
                <Text style={{ fontWeight: "800" }}>
                  {strings?.rpiBaseUrlLabel || "IP/URL"}:
                </Text>{" "}
                {baseUrl || strings?.rpiUnknown || "unknown"}
              </Text>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Pressable
                    onPress={openScanner}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 44,
                      borderRadius: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(0,0,0,0.08)",
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderWidth: 2,
                        borderColor: "#111",
                        marginRight: 8,
                        position: "relative",
                      }}
                    >
                      <View
                        style={{
                          position: "absolute",
                          top: 1,
                          left: 1,
                          width: 4,
                          height: 4,
                          backgroundColor: "#111",
                        }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          top: 1,
                          right: 1,
                          width: 4,
                          height: 4,
                          backgroundColor: "#111",
                        }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          bottom: 1,
                          left: 1,
                          width: 4,
                          height: 4,
                          backgroundColor: "#111",
                        }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          bottom: 5,
                          right: 5,
                          width: 3,
                          height: 3,
                          backgroundColor: "#111",
                        }}
                      />
                    </View>
                    <Text style={{ color: "#111", fontWeight: "700" }}>
                      {strings?.rpiScanQr || "Escanear QR"}
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  disabled={!isRaspberryConnected}
                  onPress={onSynchronize}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 44,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(0,0,0,0.08)",
                    opacity:
                      !isRaspberryConnected
                        ? 0.45
                        : pressed
                        ? 0.85
                        : 1,
                  })}
                >
                  <Image
                    source={SYNCHRONIZE_ICON}
                    resizeMode="contain"
                    style={{ width: 18, height: 18, marginRight: 8 }}
                  />
                  <Text style={{ color: "#111", fontWeight: "800" }}>
                    Sincronizar
                  </Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1, flexDirection: "row", gap: 10 }}>
                  <Pressable
                    disabled={changingVolume || !isRaspberryConnected}
                    onPress={onVolumeDown}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 40,
                      borderRadius: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(0,0,0,0.08)",
                      opacity:
                        changingVolume || !isRaspberryConnected
                          ? 0.45
                          : pressed
                          ? 0.8
                          : 1,
                    })}
                  >
                    <Image
                      source={VOLUME_DOWN_ICON}
                      resizeMode="contain"
                      style={{ width: 24, height: 24 }}
                    />
                  </Pressable>

                  <Pressable
                    disabled={changingVolume || !isRaspberryConnected}
                    onPress={onVolumeUp}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 40,
                      borderRadius: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(0,0,0,0.08)",
                      opacity:
                        changingVolume || !isRaspberryConnected
                          ? 0.45
                          : pressed
                          ? 0.8
                          : 1,
                    })}
                  >
                    <Image
                      source={VOLUME_UP_ICON}
                      resizeMode="contain"
                      style={{ width: 24, height: 24 }}
                    />
                  </Pressable>
                </View>

                <Pressable
                  disabled={stopping || !isRaspberryConnected}
                  onPress={onStop}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 40,
                    borderRadius: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#111",
                    opacity:
                      stopping || !isRaspberryConnected
                        ? 0.45
                        : pressed
                        ? 0.85
                        : 1,
                  })}
                >
                  <Image
                    source={STOP_ICON}
                    resizeMode="contain"
                    style={{ width: 16, height: 16, marginRight: 8 }}
                  />
                  <Text style={{ color: "#fff", fontWeight: "800" }}>
                    {stopping
                      ? strings?.rpiStopping || "Stopping..."
                      : strings?.rpiStop || "Detener"}
                  </Text>
                </Pressable>
              </View>

              <View style={{ marginTop: 10 }}>
                <Pressable
                  onPress={onOpenYoutube}
                  style={({ pressed }) => ({
                    width: "100%",
                    height: 42,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(0,0,0,0.08)",
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Image
                    source={YOUTUBE_ICON}
                    resizeMode="contain"
                    style={{ width: 22, height: 22, marginRight: 8 }}
                  />
                  <Text style={{ color: "#111", fontWeight: "800" }}>
                    Visitar canal de YouTube
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={scannerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeScanner}
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scannerLocked ? undefined : onScanQr}
          />

          <View
            style={{
              position: "absolute",
              top: insets.top + 14,
              left: 16,
              right: 16,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>
              {strings?.rpiScanQr || "Scan QR"}
            </Text>
            <Pressable
              onPress={closeScanner}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.2)",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>×</Text>
            </Pressable>
          </View>

          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: insets.bottom + 22,
              left: 24,
              right: 24,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 14,
                textAlign: "center",
                backgroundColor: "rgba(0,0,0,0.45)",
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 10,
              }}
            >
              {strings?.rpiQrHint || "Scan a QR containing a Raspberry URL like http://10.1.35.27:5050"}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}
