import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canFallbackForGatewayError,
  getSandboxVehicleSamples,
  isSandboxVehicleFallbackAllowed,
  lookupSandboxVehicle,
} from '../src/server/insurance/sandboxVehicleGateway.js';

test('sandbox vehicle lookup mirrors Mockoon sample CAR01 for JRT 9289', () => {
  const lookup = lookupSandboxVehicle({
    plate_number: 'jrt 9289',
    owner_id: '951018-14-5405',
    owner_id_type: 'nric',
    usage_type: 'private',
  });

  assert.equal(lookup.sample_id, 'CAR01');
  assert.equal(lookup.vehicle_ref_id, 'veh-car01');
  assert.equal(lookup.plate_number, 'JRT9289');
  assert.equal(lookup.owner_id_type, 'nric');
  assert.equal(lookup.vehicle.make, 'Perodua');
  assert.equal(lookup.vehicle.model, 'Myvi');
  assert.equal(lookup.vehicle.year, 2019);
  assert.equal(lookup.vehicle.engine_cc, 1496);
  assert.equal(lookup.address.postcode, '47000');
  assert.equal(lookup.ncd_percent, 20);
  assert.equal(lookup.eligibility.renewal_allowed, true);
});

test('sandbox vehicle lookup requires exact plate and owner pair', () => {
  assert.equal(lookupSandboxVehicle({
    plate_number: 'JRT9289',
    owner_id: '951018145400',
  }), null);

  assert.equal(lookupSandboxVehicle({
    plate_number: 'UNKNOWN1',
    owner_id: '951018145405',
  }), null);
});

test('sandbox fallback is allowed in local development and Vercel preview by default', () => {
  assert.equal(isSandboxVehicleFallbackAllowed({
    NODE_ENV: 'development',
    VERCEL_ENV: '',
  }), true);

  assert.equal(isSandboxVehicleFallbackAllowed({
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
  }), true);

  assert.equal(isSandboxVehicleFallbackAllowed({
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
  }), false);
});

test('sandbox fallback can be explicitly enabled or disabled', () => {
  assert.equal(isSandboxVehicleFallbackAllowed({
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    INSURER_API_SANDBOX_FALLBACK: 'true',
  }), true);

  assert.equal(isSandboxVehicleFallbackAllowed({
    NODE_ENV: 'development',
    VERCEL_ENV: '',
    INSURER_API_SANDBOX_FALLBACK: 'false',
  }), false);
});

test('sandbox fallback only rescues gateway availability failures', () => {
  assert.equal(canFallbackForGatewayError(
    { status: null, code: null, message: 'fetch failed' },
    { NODE_ENV: 'development' }
  ), true);

  assert.equal(canFallbackForGatewayError(
    { status: 404, code: 'VEHICLE_NOT_FOUND' },
    { NODE_ENV: 'development' }
  ), false);

  assert.equal(canFallbackForGatewayError(
    { status: 422, code: 'VALIDATION_ERROR' },
    { NODE_ENV: 'development' }
  ), false);

  assert.equal(canFallbackForGatewayError(
    { status: null, code: null },
    { NODE_ENV: 'production', VERCEL_ENV: 'production' }
  ), false);
});

test('sandbox sample list contains all Mockoon vehicle samples', () => {
  const samples = getSandboxVehicleSamples();
  assert.equal(samples.length, 10);
  assert.deepEqual(samples.map((sample) => sample.sampleId), [
    'CAR01',
    'CAR02',
    'CAR03',
    'CAR04',
    'CAR05',
    'CAR06',
    'CAR07',
    'CAR08',
    'CAR09',
    'CAR10',
  ]);
});
