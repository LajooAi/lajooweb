const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

const SANDBOX_VEHICLES = [
  {
    sampleId: 'CAR01',
    plate: 'JRT9289',
    ownerIdType: 'nric',
    ownerId: '951018145405',
    make: 'Perodua',
    model: 'Myvi',
    year: 2019,
    engineCc: 1496,
    ncdPercent: 20,
    city: 'Shah Alam',
    state: 'Selangor',
    postcode: '47000',
    usageType: 'private',
    renewalAllowed: true,
    printedRoadTaxAllowed: false,
    underwritingReferral: false,
  },
  {
    sampleId: 'CAR02',
    plate: 'WXY1234',
    ownerIdType: 'nric',
    ownerId: '900101105544',
    make: 'Honda',
    model: 'City',
    year: 2018,
    engineCc: 1500,
    ncdPercent: 25,
    city: 'Kuala Lumpur',
    state: 'WP Kuala Lumpur',
    postcode: '50450',
    usageType: 'private',
    renewalAllowed: true,
    printedRoadTaxAllowed: false,
    underwritingReferral: false,
  },
  {
    sampleId: 'CAR03',
    plate: 'ABC5678',
    ownerIdType: 'nric',
    ownerId: '880303106677',
    make: 'Toyota',
    model: 'Vios',
    year: 2017,
    engineCc: 1500,
    ncdPercent: 38.33,
    city: 'Butterworth',
    state: 'Penang',
    postcode: '12000',
    usageType: 'private',
    renewalAllowed: true,
    printedRoadTaxAllowed: false,
    underwritingReferral: false,
  },
  {
    sampleId: 'CAR04',
    plate: 'BND2020',
    ownerIdType: 'nric',
    ownerId: '920909106688',
    make: 'Proton',
    model: 'X70',
    year: 2020,
    engineCc: 1800,
    ncdPercent: 15,
    city: 'Seremban',
    state: 'Negeri Sembilan',
    postcode: '70000',
    usageType: 'private',
    renewalAllowed: true,
    printedRoadTaxAllowed: false,
    underwritingReferral: false,
  },
  {
    sampleId: 'CAR05',
    plate: 'VHX7721',
    ownerIdType: 'nric',
    ownerId: '950505141212',
    make: 'Nissan',
    model: 'Almera',
    year: 2016,
    engineCc: 1498,
    ncdPercent: 0,
    city: 'Johor Bahru',
    state: 'Johor',
    postcode: '80000',
    usageType: 'private',
    renewalAllowed: true,
    printedRoadTaxAllowed: false,
    underwritingReferral: false,
  },
  {
    sampleId: 'CAR06',
    plate: 'QQA8810',
    ownerIdType: 'company_reg',
    ownerId: '202001234567',
    make: 'Toyota',
    model: 'Hilux',
    year: 2021,
    engineCc: 2400,
    ncdPercent: 30,
    city: 'Shah Alam',
    state: 'Selangor',
    postcode: '40150',
    usageType: 'private',
    renewalAllowed: true,
    printedRoadTaxAllowed: true,
    underwritingReferral: false,
  },
  {
    sampleId: 'CAR07',
    plate: 'FID5566',
    ownerIdType: 'foreign_id',
    ownerId: 'A12345678',
    make: 'Mazda',
    model: 'CX-5',
    year: 2019,
    engineCc: 2000,
    ncdPercent: 20,
    city: 'George Town',
    state: 'Penang',
    postcode: '10200',
    usageType: 'private',
    renewalAllowed: true,
    printedRoadTaxAllowed: true,
    underwritingReferral: false,
  },
  {
    sampleId: 'CAR08',
    plate: 'EHL3344',
    ownerIdType: 'nric',
    ownerId: '930707107799',
    make: 'Perodua',
    model: 'Bezza',
    year: 2022,
    engineCc: 1300,
    ncdPercent: 20,
    city: 'Petaling Jaya',
    state: 'Selangor',
    postcode: '46000',
    usageType: 'ehailing',
    renewalAllowed: true,
    printedRoadTaxAllowed: false,
    underwritingReferral: false,
  },
  {
    sampleId: 'CAR09',
    plate: 'REF9090',
    ownerIdType: 'nric',
    ownerId: '870202108811',
    make: 'BMW',
    model: '320i',
    year: 2014,
    engineCc: 2000,
    ncdPercent: 55,
    city: 'Kuala Lumpur',
    state: 'WP Kuala Lumpur',
    postcode: '50480',
    usageType: 'private',
    renewalAllowed: true,
    printedRoadTaxAllowed: false,
    underwritingReferral: true,
  },
  {
    sampleId: 'CAR10',
    plate: 'DCL4040',
    ownerIdType: 'nric',
    ownerId: '810101109922',
    make: 'Mitsubishi',
    model: 'Lancer',
    year: 2009,
    engineCc: 2000,
    ncdPercent: 0,
    city: 'Ipoh',
    state: 'Perak',
    postcode: '30000',
    usageType: 'private',
    renewalAllowed: false,
    printedRoadTaxAllowed: false,
    underwritingReferral: false,
  },
];

function normalizePlate(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function normalizeOwnerId(value) {
  return String(value || '').replace(/[\s-]+/g, '').toUpperCase();
}

function normalizeEnvFlag(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;
  return null;
}

function maskOwnerId(ownerId) {
  const normalized = normalizeOwnerId(ownerId);
  if (normalized.length <= 6) return `${normalized.slice(0, 2)}******`;
  return `${normalized.slice(0, 6)}******`;
}

function toGatewayLookupData(vehicle) {
  return {
    sample_id: vehicle.sampleId,
    vehicle_ref_id: `veh-${vehicle.sampleId.toLowerCase()}`,
    plate_number: vehicle.plate,
    owner_id_type: vehicle.ownerIdType,
    owner_id_masked: maskOwnerId(vehicle.ownerId),
    usage_type: vehicle.usageType,
    vehicle: {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      engine_cc: vehicle.engineCc,
    },
    address: {
      postcode: vehicle.postcode,
      city: vehicle.city,
      state: vehicle.state,
    },
    ncd_percent: vehicle.ncdPercent,
    eligibility: {
      renewal_allowed: vehicle.renewalAllowed,
      printed_roadtax_allowed: vehicle.printedRoadTaxAllowed,
      underwriting_referral: vehicle.underwritingReferral,
    },
    sandbox_source: 'local_preview_fallback',
  };
}

export function isSandboxVehicleFallbackAllowed(env = process.env) {
  const explicit = normalizeEnvFlag(env.INSURER_API_SANDBOX_FALLBACK);
  if (explicit !== null) return explicit;

  if (env.NODE_ENV !== 'production') return true;
  return env.VERCEL_ENV === 'preview';
}

export function canFallbackForGatewayError(error, env = process.env) {
  if (!isSandboxVehicleFallbackAllowed(env)) return false;
  if (!error) return true;

  const status = Number(error?.status || 0);
  if (status === 404 || status === 401 || status === 422 || status === 403) return false;

  const code = String(error?.code || '').toUpperCase();
  if (code === 'VEHICLE_NOT_FOUND' || code === 'VALIDATION_ERROR' || code === 'UNAUTHORIZED') {
    return false;
  }

  return true;
}

export function lookupSandboxVehicle(payload = {}) {
  const plate = normalizePlate(payload.plate_number || payload.plateNumber || payload.plate);
  const ownerId = normalizeOwnerId(payload.owner_id || payload.ownerId || payload.nricNumber);

  if (!plate || !ownerId) return null;

  const match = SANDBOX_VEHICLES.find((vehicle) => (
    normalizePlate(vehicle.plate) === plate
    && normalizeOwnerId(vehicle.ownerId) === ownerId
  ));

  return match ? toGatewayLookupData(match) : null;
}

export function getSandboxVehicleSamples() {
  return SANDBOX_VEHICLES.map((vehicle) => ({
    sampleId: vehicle.sampleId,
    plate: vehicle.plate,
    ownerIdType: vehicle.ownerIdType,
    ownerId: vehicle.ownerId,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
  }));
}
