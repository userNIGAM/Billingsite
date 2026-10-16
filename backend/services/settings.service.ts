import { CanteenProfile } from '../models/canteenProfile.model';

/**
 * Small singleton document holding the canteen's own details, used on
 * printed bills (§58) and the Settings page.
 */
export async function getCanteenProfile() {
  const profile = await CanteenProfile.findOne().sort({ createdAt: 1 }).lean();
  if (profile) {
    return {
      name: profile.name,
      address: profile.address,
      phone: profile.phone,
      panNumber: profile.panNumber ?? '',
      billingNote: profile.billingNote,
    };
  }
  return CanteenProfile_DEFAULTS;
}

export const CanteenProfile_DEFAULTS = {
  name: '',
  address: '',
  phone: '',
  panNumber: '',
  billingNote: '',
};

export async function updateCanteenProfile(
  input: { name?: string; address?: string; phone?: string; panNumber?: string; billingNote?: string }
) {
  // Mongo rejects an update where the same path appears in both $set and
  // $setOnInsert (ConflictingUpdateOperators, code 40), so the defaults must
  // only seed the fields the caller did NOT supply. Sending all four defaults
  // alongside any non-empty input made this endpoint 500 on every call.
  const setOnInsert: Record<string, string> = {};
  for (const [key, value] of Object.entries(CanteenProfile_DEFAULTS)) {
    if (input[key as keyof typeof input] === undefined) {
      setOnInsert[key] = value;
    }
  }

  const doc = await CanteenProfile.findOneAndUpdate(
    {},
    Object.keys(setOnInsert).length > 0
      ? { $set: input, $setOnInsert: setOnInsert }
      : { $set: input },
    { upsert: true, new: true }
  );
  return {
    name: doc.name,
    address: doc.address,
    phone: doc.phone,
    panNumber: doc.panNumber ?? '',
    billingNote: doc.billingNote,
  };
}