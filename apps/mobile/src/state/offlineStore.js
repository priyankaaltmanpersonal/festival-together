import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_STATE_KEY = 'festival-together/app-state-v1';
const MUTATION_QUEUE_KEY = 'festival-together/mutation-queue-v1';

export async function loadAppState() {
  const raw = await AsyncStorage.getItem(APP_STATE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveAppState(snapshot) {
  await AsyncStorage.setItem(APP_STATE_KEY, JSON.stringify(snapshot));
}

export async function loadMutationQueue() {
  const raw = await AsyncStorage.getItem(MUTATION_QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveMutationQueue(queue) {
  await AsyncStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue));
}

export async function clearOfflineState() {
  await AsyncStorage.multiRemove([APP_STATE_KEY, MUTATION_QUEUE_KEY]);
}
