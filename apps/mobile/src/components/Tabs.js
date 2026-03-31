import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export function Tabs({ activeTab, onChange }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const tabs = [
    { id: 'setup', label: 'Setup' },
    { id: 'group', label: 'Group Schedule' },
    { id: 'individual', label: 'Individual Schedules' }
  ];

  return (
    <View style={styles.wrap}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.id}
          onPress={() => onChange(tab.id)}
          style={[styles.tab, activeTab === tab.id && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 12
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.tabBorder,
    backgroundColor: C.tabBg
  },
  tabActive: {
    borderColor: C.tabActiveBorder,
    backgroundColor: C.tabActiveBg
  },
  tabText: {
    fontSize: 12,
    color: C.tabText,
    fontWeight: '600'
  },
  tabTextActive: {
    color: C.tabActiveText
  }
});
