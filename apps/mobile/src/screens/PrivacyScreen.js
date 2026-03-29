import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export function PrivacyScreen({ onAccept }) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.h1}>Privacy & Terms</Text>

      <View style={styles.card}>
        <Text style={styles.row}>
          <Text style={styles.label}>What we collect: </Text>
          <Text style={styles.body}>Your display name, color, and festival schedule screenshots. Screenshots are sent to Google Cloud Vision for text extraction and are not stored.</Text>
        </Text>
        <Text style={styles.row}>
          <Text style={styles.label}>How we use it: </Text>
          <Text style={styles.body}>Your schedule is shared only with your group members. We don't sell data or use it for ads.</Text>
        </Text>
        <Text style={styles.row}>
          <Text style={styles.label}>Third-party services: </Text>
          <Text style={styles.body}>Google Cloud Vision reads text from your screenshots (google.com/policies/privacy). Claude AI interprets the schedule text.</Text>
        </Text>
        <Text style={styles.row}>
          <Text style={styles.label}>Your rights: </Text>
          <Text style={styles.body}>Use "Delete My Data" in the app menu to permanently remove your account and schedule preferences from our servers.</Text>
        </Text>
      </View>

      <Pressable style={styles.button} onPress={onAccept}>
        <Text style={styles.buttonText}>I Understand — Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, gap: 12, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
  h1: { color: '#1f3024', fontSize: 20, fontWeight: '800' },
  card: {
    backgroundColor: '#fffefb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0d2bb',
    padding: 12,
    gap: 10
  },
  row: { fontSize: 13, lineHeight: 19, color: '#555' },
  label: { fontWeight: '700', color: '#2f302f' },
  body: { fontWeight: '400' },
  button: {
    backgroundColor: '#183a27',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 17 }
});
