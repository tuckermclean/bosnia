import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { color, radius } from '@/theme/tokens';

export interface ProgressBarProps {
  /** 0-1 */
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({
  progress,
  height = 12,
  trackColor = color.gray200,
  fillColor = color.gold500,
  style,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const widthShared = useSharedValue(clamped);

  React.useEffect(() => {
    widthShared.value = withTiming(clamped, { duration: 350 });
  }, [clamped, widthShared]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${widthShared.value * 100}%`,
  }));

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: trackColor },
        style,
      ]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View
        style={[
          styles.fill,
          { borderRadius: height / 2, backgroundColor: fillColor },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});
