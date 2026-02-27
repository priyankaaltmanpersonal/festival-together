import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

const DEFAULT_API_URL = 'http://127.0.0.1:8000';

async function apiRequest({ baseUrl, path, method = 'GET', sessionToken, body }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'x-session-token': sessionToken } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.detail || payload?.message || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return payload;
}

function Pill({ label, selected, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, selected && styles.pillSelected]}>
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);

  const [founderName, setFounderName] = useState('Priyanka');
  const [groupName, setGroupName] = useState('Festival Together Crew');
  const [memberName, setMemberName] = useState('Alex');
  const [screenshotCount, setScreenshotCount] = useState('3');

  const [founderSession, setFounderSession] = useState('');
  const [memberSession, setMemberSession] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [groupId, setGroupId] = useState('');

  const [personalSets, setPersonalSets] = useState([]);
  const [homeSnapshot, setHomeSnapshot] = useState(null);
  const [scheduleSnapshot, setScheduleSnapshot] = useState(null);
  const [mustSeeOnly, setMustSeeOnly] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');

  const canCreateGroup = useMemo(() => founderName.trim() && groupName.trim(), [founderName, groupName]);

  const appendLog = (line) => setLog((prev) => [line, ...prev].slice(0, 16));

  const run = async (label, action) => {
    setLoading(true);
    setError('');
    try {
      await action();
      appendLog(`OK: ${label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      appendLog(`ERR: ${label} -> ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const createFounderGroup = () =>
    run('create founder group', async () => {
      const payload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/groups',
        method: 'POST',
        body: { group_name: groupName.trim(), display_name: founderName.trim() }
      });
      setFounderSession(payload.session.token);
      setInviteCode(payload.group.invite_code);
      setGroupId(payload.group.id);
      setHomeSnapshot(null);
      setPersonalSets([]);
    });

  const completeFounderCanonicalSetup = () =>
    run('founder canonical setup', async () => {
      if (!founderSession || !groupId) throw new Error('Create founder group first');
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/canonical/import`,
        method: 'POST',
        sessionToken: founderSession,
        body: { screenshot_count: 4 }
      });
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/canonical/confirm`,
        method: 'POST',
        sessionToken: founderSession
      });
    });

  const createJoinerAndJoin = () =>
    run('create joiner and join group', async () => {
      if (!inviteCode) throw new Error('Need invite code first');

      const joiner = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/groups',
        method: 'POST',
        body: { group_name: 'Temporary Group', display_name: memberName.trim() }
      });
      const newMemberSession = joiner.session.token;

      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/invites/${inviteCode}/join`,
        method: 'POST',
        sessionToken: newMemberSession,
        body: { display_name: memberName.trim(), leave_current_group: true }
      });

      setMemberSession(newMemberSession);
    });

  const importPersonal = () =>
    run('import personal screenshots', async () => {
      if (!memberSession) throw new Error('Need member session first');

      const count = Number.parseInt(screenshotCount, 10);
      if (!Number.isFinite(count) || count < 1 || count > 30) {
        throw new Error('Screenshot count must be between 1 and 30');
      }

      await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/personal/import',
        method: 'POST',
        sessionToken: memberSession,
        body: { screenshot_count: count }
      });

      const review = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/personal/review',
        method: 'GET',
        sessionToken: memberSession
      });
      setPersonalSets(review.sets || []);
    });

  const setAllMustSee = () =>
    run('set all as must-see', async () => {
      if (!memberSession) throw new Error('Need member session first');
      if (!personalSets.length) throw new Error('Import personal sets first');

      for (const setItem of personalSets) {
        await apiRequest({
          baseUrl: apiUrl,
          path: `/v1/members/me/sets/${setItem.canonical_set_id}`,
          method: 'PATCH',
          sessionToken: memberSession,
          body: { preference: 'must_see' }
        });
      }

      const review = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/personal/review',
        method: 'GET',
        sessionToken: memberSession
      });
      setPersonalSets(review.sets || []);
    });

  const completeMemberSetup = () =>
    run('complete member setup', async () => {
      if (!memberSession) throw new Error('Need member session first');
      await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/setup/complete',
        method: 'POST',
        sessionToken: memberSession,
        body: { confirm: true }
      });
    });

  const loadHome = () =>
    run('load home snapshot', async () => {
      if (!memberSession) throw new Error('Need member session first');
      const payload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/home',
        method: 'GET',
        sessionToken: memberSession
      });
      setHomeSnapshot(payload);
      setSelectedMemberId(payload.members?.[0]?.id || '');
    });

  const loadSchedule = () =>
    run('load schedule snapshot', async () => {
      if (!memberSession || !groupId) throw new Error('Need group and member session first');

      const query = new URLSearchParams();
      if (mustSeeOnly) query.set('must_see_only', 'true');
      if (selectedMemberId) query.set('member_ids', selectedMemberId);
      const suffix = query.toString() ? `?${query.toString()}` : '';

      const payload = await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/schedule${suffix}`,
        method: 'GET',
        sessionToken: memberSession
      });
      setScheduleSnapshot(payload);
    });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Festival Together - Mobile Dev Harness</Text>
        <Text style={styles.subtitle}>
          Milestone M3 flow: founder setup, member onboarding, personal import, and home snapshot.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>API Base URL</Text>
          <TextInput value={apiUrl} onChangeText={setApiUrl} style={styles.input} autoCapitalize="none" />
          <Text style={styles.helper}>
            iOS simulator usually works with 127.0.0.1. Android emulator often needs 10.0.2.2.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Founder Setup</Text>
          <TextInput value={founderName} onChangeText={setFounderName} style={styles.input} placeholder="Founder name" />
          <TextInput value={groupName} onChangeText={setGroupName} style={styles.input} placeholder="Group name" />
          <Pressable disabled={!canCreateGroup || loading} onPress={createFounderGroup} style={styles.button}>
            <Text style={styles.buttonText}>1) Create Founder Group</Text>
          </Pressable>
          <Pressable disabled={!founderSession || loading} onPress={completeFounderCanonicalSetup} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>2) Import + Confirm Canonical</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Member Onboarding</Text>
          <TextInput value={memberName} onChangeText={setMemberName} style={styles.input} placeholder="Member display name" />
          <TextInput
            value={screenshotCount}
            onChangeText={setScreenshotCount}
            style={styles.input}
            keyboardType="number-pad"
            placeholder="Screenshot count"
          />
          <Pressable disabled={!inviteCode || loading} onPress={createJoinerAndJoin} style={styles.button}>
            <Text style={styles.buttonText}>3) Create Joiner + Join</Text>
          </Pressable>
          <Pressable disabled={!memberSession || loading} onPress={importPersonal} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>4) Import Personal Schedule</Text>
          </Pressable>
          <Pressable disabled={!personalSets.length || loading} onPress={setAllMustSee} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>5) Set All Must-See</Text>
          </Pressable>
          <Pressable disabled={!memberSession || loading} onPress={completeMemberSetup} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>6) Complete Setup</Text>
          </Pressable>
          <Pressable disabled={!memberSession || loading} onPress={loadHome} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>7) Load Home Snapshot</Text>
          </Pressable>
          <Pressable disabled={!memberSession || loading} onPress={loadSchedule} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>8) Load Schedule Snapshot</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Live State</Text>
          <View style={styles.rowWrap}>
            <Pill label={`Invite: ${inviteCode || 'n/a'}`} selected={Boolean(inviteCode)} onPress={() => {}} />
            <Pill label={`Founder Session: ${founderSession ? 'set' : 'empty'}`} selected={Boolean(founderSession)} onPress={() => {}} />
            <Pill label={`Member Session: ${memberSession ? 'set' : 'empty'}`} selected={Boolean(memberSession)} onPress={() => {}} />
            <Pill label={`Personal Sets: ${personalSets.length}`} selected={personalSets.length > 0} onPress={() => {}} />
          </View>
          {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {homeSnapshot ? (
          <View style={styles.card}>
            <Text style={styles.label}>Home Snapshot</Text>
            <Text style={styles.bodyText}>Group: {homeSnapshot.group?.name}</Text>
            <Text style={styles.bodyText}>Me: {homeSnapshot.me?.display_name}</Text>
            <Text style={styles.bodyText}>Setup: {homeSnapshot.me?.setup_status}</Text>
            <Text style={styles.bodyText}>
              Sets: total {homeSnapshot.my_sets?.total}, must-see {homeSnapshot.my_sets?.must_see}, not going {homeSnapshot.my_sets?.not_going}
            </Text>
            <Text style={styles.bodyText}>Active members: {homeSnapshot.members?.length || 0}</Text>
            <View style={{ marginTop: 10, gap: 8 }}>
              <Text style={styles.label}>Schedule Filters</Text>
              <Pressable onPress={() => setMustSeeOnly((prev) => !prev)} style={styles.buttonSecondary}>
                <Text style={styles.buttonText}>{mustSeeOnly ? 'Must-Sees Only: ON' : 'Must-Sees Only: OFF'}</Text>
              </Pressable>
              <Text style={styles.helper}>People filter (OR behavior):</Text>
              <View style={styles.rowWrap}>
                {homeSnapshot.members?.map((member) => (
                  <Pill
                    key={member.id}
                    label={member.display_name}
                    selected={selectedMemberId === member.id}
                    onPress={() => setSelectedMemberId((prev) => (prev === member.id ? '' : member.id))}
                  />
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {scheduleSnapshot ? (
          <View style={styles.card}>
            <Text style={styles.label}>Schedule Snapshot</Text>
            <Text style={styles.bodyText}>Sets returned: {scheduleSnapshot.sets?.length || 0}</Text>
            <Text style={styles.bodyText}>
              Filters: must-see {String(scheduleSnapshot.filters?.must_see_only)} / members{' '}
              {(scheduleSnapshot.filters?.member_ids || []).length}
            </Text>
            {(scheduleSnapshot.sets || []).slice(0, 6).map((setItem) => (
              <View key={setItem.id} style={styles.setCard}>
                <Text style={styles.setTitle}>{setItem.artist_name}</Text>
                <Text style={styles.helper}>
                  {setItem.stage_name} • {setItem.start_time_pt}-{setItem.end_time_pt} • attendees {setItem.attendee_count}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.label}>Recent Log</Text>
          {log.length ? log.map((entry, idx) => <Text key={`${entry}-${idx}`} style={styles.logLine}>{entry}</Text>) : <Text style={styles.helper}>No actions yet.</Text>}
        </View>
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f0e7'
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 12
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#222'
  },
  subtitle: {
    marginTop: 4,
    color: '#4c4c4c',
    lineHeight: 20
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8d8c1',
    padding: 12,
    gap: 8
  },
  label: {
    fontWeight: '700',
    color: '#303030'
  },
  input: {
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fffdf9'
  },
  helper: {
    color: '#6a6a6a',
    fontSize: 12
  },
  button: {
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
  buttonText: {
    color: '#fff',
    fontWeight: '700'
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  pill: {
    borderWidth: 1,
    borderColor: '#cab697',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fbf6ee'
  },
  pillSelected: {
    backgroundColor: '#e4f2e7',
    borderColor: '#6a9e73'
  },
  pillText: {
    color: '#4a4a4a',
    fontSize: 12
  },
  pillTextSelected: {
    color: '#235232'
  },
  error: {
    color: '#b52424',
    fontWeight: '600'
  },
  bodyText: {
    color: '#333'
  },
  logLine: {
    color: '#444',
    fontSize: 12
  },
  setCard: {
    borderWidth: 1,
    borderColor: '#dfd0bb',
    borderRadius: 10,
    padding: 8,
    marginTop: 6,
    backgroundColor: '#fffcf7'
  },
  setTitle: {
    fontWeight: '700',
    color: '#2f2f2f'
  }
});
