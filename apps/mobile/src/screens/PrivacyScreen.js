import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export function PrivacyScreen({ onAccept }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Privacy & Terms</Text>
        <View style={styles.divider} />

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

const makeStyles = (C) => StyleSheet.create({
  wrap: { flexGrow: 1, gap: 12, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
  card: {
    flex: 1,
    backgroundColor: C.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 20,
    gap: 16,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: C.headingText },
  divider: { height: 1, backgroundColor: C.cardBorder },
  row: { fontSize: 15, lineHeight: 23, color: C.textSec },
  label: { fontWeight: '700', color: C.text },
  body: { fontWeight: '400' },
  button: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 17 }
});
