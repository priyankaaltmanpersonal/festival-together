import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

export function BottomTabBar({ activeView, onNavigate, onOpenMore }) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C, insets.bottom), [C, insets.bottom]);

  const tabs = [
    { key: 'group', icon: 'grid', label: 'Group' },
    { key: 'edit', icon: 'user', label: 'My Schedule' },
    { key: 'more', icon: 'menu', label: 'More' },
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const isActive = tab.key === 'more'
          ? activeView === 'more'
          : activeView === tab.key;
        const color = isActive ? C.primary : C.textMuted;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => tab.key === 'more' ? onOpenMore() : onNavigate(tab.key)}
          >
            <Feather name={tab.icon} size={22} color={color} />
            {isActive ? <Text style={styles.label}>{tab.label}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (C, bottomInset) => StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.tabBorder,
    backgroundColor: C.tabBg,
    paddingBottom: bottomInset || 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
    gap: 2,
    borderTopWidth: 2.5,
    borderTopColor: 'transparent',
  },
  tabActive: {
    borderTopColor: C.primary,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: C.primary,
    lineHeight: 12,
  },
});
