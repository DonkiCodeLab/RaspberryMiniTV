import React, { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VideoView, useVideoPlayer } from "expo-video";

const DEVELOPING_IMAGE = require("../../assets/splashScreen_developing.png");
const RASPBERRY_IMAGE = require("../../assets/splashScreen_raspberry.png");
const TV_IMAGE = require("../../assets/tele_simpsons.png");
const INTRO_VIDEO = require("../../assets/video_donkicodeLab.mp4");

const TV_ASPECT_RATIO = 922 / 1265;
const FADE_IN_DURATION_MS = 3000;
const VIDEO_DURATION_MS = 11145;
const SPLASH_HOLD_MS = VIDEO_DURATION_MS - 3000;
const DEVELOPING_CANVAS_WIDTH = 770;
const DEVELOPING_CANVAS_HEIGHT = 279;
const DEVELOPING_CONTENT_LEFT = 151;
const DEVELOPING_CONTENT_TOP = 65;
const DEVELOPING_CONTENT_WIDTH = 466;
const DEVELOPING_CONTENT_HEIGHT = 174;
const RASPBERRY_CANVAS_WIDTH = 1125;
const RASPBERRY_CANVAS_HEIGHT = 396;
const RASPBERRY_CONTENT_LEFT = 56;
const RASPBERRY_CONTENT_TOP = 31;
const RASPBERRY_CONTENT_WIDTH = 996;
const RASPBERRY_CONTENT_HEIGHT = 327;
const TV_VIDEO_LEFT_RATIO = 69 / 922;
const TV_VIDEO_TOP_RATIO = 611 / 1265;
const TV_VIDEO_WIDTH_RATIO = 669 / 922;
const TV_VIDEO_HEIGHT_RATIO = 535 / 1265;

export default function SplashScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const hasNavigatedRef = useRef(false);
  const player = useVideoPlayer(INTRO_VIDEO, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.play();
  });

  const goToMain = () => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    navigation.reset({
      index: 0,
      routes: [{ name: "Seasons" }],
    });
  };

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: FADE_IN_DURATION_MS,
      useNativeDriver: true,
    }).start();

    const timeoutId = setTimeout(() => {
      goToMain();
    }, SPLASH_HOLD_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [fadeAnim, navigation]);

  const developingVisibleWidth = Math.min(width * 0.3, 200);
  const developingScale = developingVisibleWidth / DEVELOPING_CONTENT_WIDTH;
  const developingFrameHeight = DEVELOPING_CONTENT_HEIGHT * developingScale;
  const developingImageWidth = DEVELOPING_CANVAS_WIDTH * developingScale;
  const developingImageHeight = DEVELOPING_CANVAS_HEIGHT * developingScale;
  const developingOffsetX = -DEVELOPING_CONTENT_LEFT * developingScale;
  const developingOffsetY = -DEVELOPING_CONTENT_TOP * developingScale;

  const raspberryVisibleWidth = Math.min(width * 0.88, 500);
  const raspberryScale = raspberryVisibleWidth / RASPBERRY_CONTENT_WIDTH;
  const raspberryFrameHeight = RASPBERRY_CONTENT_HEIGHT * raspberryScale;
  const raspberryImageWidth = RASPBERRY_CANVAS_WIDTH * raspberryScale;
  const raspberryImageHeight = RASPBERRY_CANVAS_HEIGHT * raspberryScale;
  const raspberryOffsetX = -RASPBERRY_CONTENT_LEFT * raspberryScale;
  const raspberryOffsetY = -RASPBERRY_CONTENT_TOP * raspberryScale;
  const tvWidth = width;
  const tvHeight = tvWidth / TV_ASPECT_RATIO;
  const videoWidth = tvWidth * TV_VIDEO_WIDTH_RATIO;
  const videoHeight = tvHeight * TV_VIDEO_HEIGHT_RATIO;
  const videoLeft = tvWidth * TV_VIDEO_LEFT_RATIO;
  const videoTop = tvHeight * TV_VIDEO_TOP_RATIO;
  const topSpacer = 0;

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={styles.background}>
        <SafeAreaView edges={["top"]} style={[styles.safeArea, { paddingTop: topSpacer }]}>
          <View
            style={[
              styles.croppedAssetFrame,
              {
                width: raspberryVisibleWidth,
                height: raspberryFrameHeight,
                marginTop: 8,
              },
            ]}
          >
            <Image
              source={RASPBERRY_IMAGE}
              resizeMode="stretch"
              style={{
                position: "absolute",
                left: raspberryOffsetX,
                top: raspberryOffsetY,
                width: raspberryImageWidth,
                height: raspberryImageHeight,
              }}
            />
          </View>
          <Animated.View
            style={[
              styles.croppedAssetFrame,
              {
                width: developingVisibleWidth,
                height: developingFrameHeight,
                opacity: fadeAnim,
                marginTop: 24,
              },
            ]}
          >
            <Image
              source={DEVELOPING_IMAGE}
              resizeMode="stretch"
              style={{
                position: "absolute",
                left: developingOffsetX,
                top: developingOffsetY,
                width: developingImageWidth,
                height: developingImageHeight,
              }}
            />
          </Animated.View>
        </SafeAreaView>

        <View
          style={[
            styles.tvStage,
            {
              width: tvWidth,
              height: tvHeight,
            },
          ]}
        >
          <View
            style={[
              styles.videoStage,
              {
                left: videoLeft,
                top: videoTop,
                width: videoWidth,
                height: videoHeight,
              },
            ]}
          >
            <VideoView
              player={player}
              nativeControls={false}
              fullscreenOptions={{ enable: false }}
              contentFit="cover"
              style={StyleSheet.absoluteFill}
            />
          </View>
          <Image
            source={TV_IMAGE}
            resizeMode="contain"
            style={[styles.tvImage, { width: tvWidth, height: tvHeight }]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  background: {
    flex: 1,
    backgroundColor: "#fff",
  },
  safeArea: {
    alignItems: "center",
    gap: 6,
    zIndex: 2,
  },
  croppedAssetFrame: {
    overflow: "hidden",
  },
  tvStage: {
    position: "absolute",
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "flex-end",
    zIndex: 1,
  },
  tvImage: {
    alignSelf: "center",
    zIndex: 2,
  },
  videoStage: {
    position: "absolute",
    zIndex: 1,
    overflow: "hidden",
    backgroundColor: "#000",
  },
});
