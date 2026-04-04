import * as React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import SplashScreen from "./src/screens/SplashScreen";
import SeasonsScreen from "./src/screens/SeasonsScreen";
import EpisodesScreen from "./src/screens/EpisodesScreen";
import { RaspberryStatusProvider } from "./src/context/RaspberryStatusContext";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RaspberryStatusProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Splash">
            <Stack.Screen
              name="Splash"
              component={SplashScreen}
              options={{
                headerShown: false,
                gestureEnabled: false,
                animation: "none",
              }}
            />
            <Stack.Screen
              name="Seasons"
              component={SeasonsScreen}
              options={{ headerShown: false, gestureEnabled: false }} // 👈 OCULTO
            />
            <Stack.Screen
              name="Episodes"
              component={EpisodesScreen}
              options={{ headerShown: false }} // 👈 OCULTO
            />
          </Stack.Navigator>
        </NavigationContainer>
      </RaspberryStatusProvider>
    </GestureHandlerRootView>
  );
}
