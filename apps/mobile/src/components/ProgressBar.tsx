import { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors } from '@/src/lib/theme';

interface ProgressBarProps {
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  overBudget?: boolean;
}

export function ProgressBar({
  progress,
  height = 8,
  trackColor = colors.surfaceMuted,
  fillColor = colors.iris,
  overBudget,
}: ProgressBarProps) {
  const progressValue = useSharedValue(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const clamped = Math.min(Math.max(progress, 0), 1);

  useEffect(() => {
    progressValue.value = withSpring(clamped, { damping: 18, stiffness: 120 });
  }, [clamped, progressValue]);

  const fillStyle = useAnimatedStyle(() => ({
    width: trackWidth * progressValue.value,
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={onLayout}
      style={[styles.track, { height, backgroundColor: trackColor, borderRadius: height / 2 }]}
    >
      <Animated.View
        style={[
          styles.fill,
          fillStyle,
          {
            height,
            borderRadius: height / 2,
            backgroundColor: overBudget ? colors.rose : fillColor,
          },
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
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
