import { Pressable, StyleSheet, Text, View } from 'react-native';

export function Tabs({ activeTab, onChange }) {
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

const styles = StyleSheet.create({
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
    borderColor: '#ccb79b',
    backgroundColor: '#fff8ef'
  },
  tabActive: {
    borderColor: '#2f6244',
    backgroundColor: '#e6f2e8'
  },
  tabText: {
    fontSize: 12,
    color: '#4e4e4e',
    fontWeight: '600'
  },
  tabTextActive: {
    color: '#214731'
  }
});
