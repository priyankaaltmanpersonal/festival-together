import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export function DaySelector({ days, selectedDay, onSelect }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  if (!days || days.length <= 1) return null;

  return (
    <View style={styles.container}>
      {days.map((day) => {
        const isActive = day.dayIndex === selectedDay;
        return (
          <Pressable
            key={day.dayIndex}
            onPress={() => onSelect(day.dayIndex)}
            style={[styles.option, isActive && styles.optionActive]}
          >
            <Text style={[styles.text, isActive && styles.textActive]}>
              {day.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: C.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.inputBorder,
    padding: 3,
    gap: 2,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionActive: {
    backgroundColor: C.primaryBg,
    borderColor: C.primary,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
  },
  textActive: {
    color: C.text,
    fontWeight: '700',
  },
});
