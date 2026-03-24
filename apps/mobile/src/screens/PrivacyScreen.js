import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export function PrivacyScreen({ onAccept }) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Before you begin</Text>
        <Text style={styles.h1}>Privacy & Terms</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What we collect</Text>
        <Text style={styles.body}>
          Festival Together collects the display name you enter, the color you pick, and the
          festival schedule screenshots you choose to upload. Screenshots are sent to Google
          Cloud Vision for text extraction and are not stored permanently.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How we use it</Text>
        <Text style={styles.body}>
          Your schedule and preferences are shared only with members of your group. We do not
          sell your data or use it for advertising. Data is stored on our servers for the
          duration of the festival season.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Third-party services</Text>
        <Text style={styles.body}>
          We use Google Cloud Vision API to read text from your screenshots. Images are
          transmitted to Google's servers for OCR processing. Please review Google's Privacy
          Policy at google.com/policies/privacy.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your rights</Text>
        <Text style={styles.body}>
          You can delete your data at any time by using "Restart Onboarding" in the app. This
          removes your session and schedule preferences from our servers.
        </Text>
      </View>

      <Pressable style={styles.button} onPress={onAccept}>
        <Text style={styles.buttonText}>I Understand — Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, gap: 12, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },
  card: {
    backgroundColor: '#fffdf8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5d7c3',
    padding: 12,
    gap: 6
  },
  kicker: { color: '#7a684f', fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  h1: { color: '#1f3024', fontSize: 21, fontWeight: '800', lineHeight: 26 },
  section: {
    backgroundColor: '#fffefb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0d2bb',
    padding: 12,
    gap: 6
  },
  sectionTitle: { color: '#2f302f', fontWeight: '700', fontSize: 14 },
  body: { color: '#555', fontSize: 13, lineHeight: 20 },
  button: {
    backgroundColor: '#183a27',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginTop: 4
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 17 }
});
