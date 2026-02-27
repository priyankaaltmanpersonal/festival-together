import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export function SetupScreen({
  apiUrl,
  setApiUrl,
  founderName,
  setFounderName,
  groupName,
  setGroupName,
  memberName,
  setMemberName,
  screenshotCount,
  setScreenshotCount,
  inviteCode,
  founderSession,
  memberSession,
  personalSets,
  homeSnapshot,
  loading,
  error,
  log,
  onCreateFounderGroup,
  onCompleteFounderCanonicalSetup,
  onCreateJoinerAndJoin,
  onImportPersonal,
  onSetAllMustSee,
  onCompleteMemberSetup,
  onLoadHome
}) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>API Base URL</Text>
        <TextInput value={apiUrl} onChangeText={setApiUrl} style={styles.input} autoCapitalize="none" />
        <Text style={styles.helper}>iOS simulator: 127.0.0.1 / Android emulator: 10.0.2.2</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Founder Setup</Text>
        <TextInput value={founderName} onChangeText={setFounderName} style={styles.input} placeholder="Founder name" />
        <TextInput value={groupName} onChangeText={setGroupName} style={styles.input} placeholder="Group name" />
        <Pressable onPress={onCreateFounderGroup} style={styles.buttonPrimary}>
          <Text style={styles.buttonText}>1) Create Founder Group</Text>
        </Pressable>
        <Pressable disabled={!founderSession} onPress={onCompleteFounderCanonicalSetup} style={styles.buttonSecondary}>
          <Text style={styles.buttonText}>2) Import + Confirm Canonical</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Member Onboarding</Text>
        <TextInput value={memberName} onChangeText={setMemberName} style={styles.input} placeholder="Member name" />
        <TextInput
          value={screenshotCount}
          onChangeText={setScreenshotCount}
          style={styles.input}
          keyboardType="number-pad"
          placeholder="Screenshot count"
        />
        <Pressable disabled={!inviteCode} onPress={onCreateJoinerAndJoin} style={styles.buttonPrimary}>
          <Text style={styles.buttonText}>3) Create Joiner + Join</Text>
        </Pressable>
        <Pressable disabled={!memberSession} onPress={onImportPersonal} style={styles.buttonSecondary}>
          <Text style={styles.buttonText}>4) Import Personal Schedule</Text>
        </Pressable>
        <Pressable disabled={!personalSets?.length} onPress={onSetAllMustSee} style={styles.buttonSecondary}>
          <Text style={styles.buttonText}>5) Set All Must-See</Text>
        </Pressable>
        <Pressable disabled={!memberSession} onPress={onCompleteMemberSetup} style={styles.buttonSecondary}>
          <Text style={styles.buttonText}>6) Complete Setup</Text>
        </Pressable>
        <Pressable disabled={!memberSession} onPress={onLoadHome} style={styles.buttonSecondary}>
          <Text style={styles.buttonText}>7) Load Home Snapshot</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.helper}>Invite: {inviteCode || 'n/a'}</Text>
        <Text style={styles.helper}>Founder session: {founderSession ? 'set' : 'empty'}</Text>
        <Text style={styles.helper}>Member session: {memberSession ? 'set' : 'empty'}</Text>
        <Text style={styles.helper}>Personal sets: {personalSets?.length || 0}</Text>
        <Text style={styles.helper}>Group: {homeSnapshot?.group?.name || 'n/a'}</Text>
        {loading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Recent Log</Text>
        {(log || []).length ? (log || []).map((entry, idx) => <Text key={`${entry}-${idx}`} style={styles.logLine}>{entry}</Text>) : <Text style={styles.helper}>No actions yet.</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingBottom: 22 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8d8c1',
    padding: 12,
    gap: 8
  },
  label: { fontWeight: '700', color: '#303030' },
  helper: { color: '#666', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fffdf9'
  },
  buttonPrimary: {
    backgroundColor: '#183a27',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  buttonSecondary: {
    backgroundColor: '#345a46',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  error: { color: '#b52424', fontWeight: '600' },
  logLine: { color: '#444', fontSize: 12 }
});
