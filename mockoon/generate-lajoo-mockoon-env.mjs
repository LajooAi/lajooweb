import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_FILE = path.join(__dirname, 'lajoo-insurer-sandbox-v33.json');

const API_VERSION = 'v1';
const STATIC_TIMESTAMP = '2026-03-06T10:00:00Z';
const AUTH_TOKEN = 'Bearer mock-access-token';

const BASE_PREMIUMS = {
  TAKAFUL: { base: 995, final: 796, sumInsured: 34000, name: 'Takaful Ikhlas' },
  ETIQA: { base: 1090, final: 872, sumInsured: 35000, name: 'Etiqa Insurance' },
  ALLIANZ: { base: 1150, final: 920, sumInsured: 36000, name: 'Allianz Insurance' },
};

const SCENARIO_LOADING = {
  normal: 0,
  flood_prone: 25,
  high_cc: 40,
  claims_loading: 120,
  company_vehicle: 10,
  foreign_id: 10,
  ehailing: 0,
  underwriting_referral: 60,
  decline: 0,
};

const CARS = [
  {
    sampleId: 'CAR01',
    plate: 'JRT9289',
    ownerIdType: 'nric',
    ownerId: '951018145405',
    make: 'Perodua',
    model: 'Myvi',
    year: 2019,
    cc: 1496,
    ncd: 20,
    city: 'Shah Alam',
    state: 'Selangor',
    postcode: '47000',
    scenario: 'normal',
    printedRoadTaxEligible: false,
  },
  {
    sampleId: 'CAR02',
    plate: 'WXY1234',
    ownerIdType: 'nric',
    ownerId: '900101105544',
    make: 'Honda',
    model: 'City',
    year: 2018,
    cc: 1500,
    ncd: 25,
    city: 'Kuala Lumpur',
    state: 'WP Kuala Lumpur',
    postcode: '50450',
    scenario: 'normal',
    printedRoadTaxEligible: false,
  },
  {
    sampleId: 'CAR03',
    plate: 'ABC5678',
    ownerIdType: 'nric',
    ownerId: '880303106677',
    make: 'Toyota',
    model: 'Vios',
    year: 2017,
    cc: 1500,
    ncd: 38.33,
    city: 'Butterworth',
    state: 'Penang',
    postcode: '12000',
    scenario: 'flood_prone',
    printedRoadTaxEligible: false,
  },
  {
    sampleId: 'CAR04',
    plate: 'BND2020',
    ownerIdType: 'nric',
    ownerId: '920909106688',
    make: 'Proton',
    model: 'X70',
    year: 2020,
    cc: 1800,
    ncd: 15,
    city: 'Seremban',
    state: 'Negeri Sembilan',
    postcode: '70000',
    scenario: 'high_cc',
    printedRoadTaxEligible: false,
  },
  {
    sampleId: 'CAR05',
    plate: 'VHX7721',
    ownerIdType: 'nric',
    ownerId: '950505141212',
    make: 'Nissan',
    model: 'Almera',
    year: 2016,
    cc: 1498,
    ncd: 0,
    city: 'Johor Bahru',
    state: 'Johor',
    postcode: '80000',
    scenario: 'claims_loading',
    printedRoadTaxEligible: false,
  },
  {
    sampleId: 'CAR06',
    plate: 'QQA8810',
    ownerIdType: 'company_reg',
    ownerId: '202001234567',
    make: 'Toyota',
    model: 'Hilux',
    year: 2021,
    cc: 2400,
    ncd: 30,
    city: 'Shah Alam',
    state: 'Selangor',
    postcode: '40150',
    scenario: 'company_vehicle',
    printedRoadTaxEligible: true,
  },
  {
    sampleId: 'CAR07',
    plate: 'FID5566',
    ownerIdType: 'foreign_id',
    ownerId: 'A12345678',
    make: 'Mazda',
    model: 'CX-5',
    year: 2019,
    cc: 2000,
    ncd: 20,
    city: 'George Town',
    state: 'Penang',
    postcode: '10200',
    scenario: 'foreign_id',
    printedRoadTaxEligible: true,
  },
  {
    sampleId: 'CAR08',
    plate: 'EHL3344',
    ownerIdType: 'nric',
    ownerId: '930707107799',
    make: 'Perodua',
    model: 'Bezza',
    year: 2022,
    cc: 1300,
    ncd: 20,
    city: 'Petaling Jaya',
    state: 'Selangor',
    postcode: '46000',
    scenario: 'ehailing',
    printedRoadTaxEligible: false,
  },
  {
    sampleId: 'CAR09',
    plate: 'REF9090',
    ownerIdType: 'nric',
    ownerId: '870202108811',
    make: 'BMW',
    model: '320i',
    year: 2014,
    cc: 2000,
    ncd: 55,
    city: 'Kuala Lumpur',
    state: 'WP Kuala Lumpur',
    postcode: '50480',
    scenario: 'underwriting_referral',
    printedRoadTaxEligible: false,
  },
  {
    sampleId: 'CAR10',
    plate: 'DCL4040',
    ownerIdType: 'nric',
    ownerId: '810101109922',
    make: 'Mitsubishi',
    model: 'Lancer',
    year: 2009,
    cc: 2000,
    ncd: 0,
    city: 'Ipoh',
    state: 'Perak',
    postcode: '30000',
    scenario: 'decline',
    printedRoadTaxEligible: false,
  },
];

function rule(target, modifier, value, operator = 'equals', invert = false) {
  return { target, modifier, value, operator, invert };
}

function envelope(requestId, data, errors = []) {
  return {
    meta: {
      request_id: requestId,
      correlation_id: 'corr-static-001',
      timestamp: STATIC_TIMESTAMP,
      version: API_VERSION,
    },
    data,
    errors,
  };
}

function jsonBody(input) {
  return JSON.stringify(input, null, 2);
}

function response({
  label,
  statusCode,
  body,
  defaultResponse = false,
  latency = 0,
  headers = [],
  rules = [],
  rulesOperator = 'OR',
  fallbackTo404 = false,
}) {
  return {
    uuid: randomUUID(),
    body: jsonBody(body),
    latency,
    statusCode,
    label,
    headers,
    bodyType: 'INLINE',
    filePath: '',
    databucketID: '',
    sendFileAsBody: false,
    rules,
    rulesOperator,
    disableTemplating: false,
    fallbackTo404,
    default: defaultResponse,
    crudKey: '',
    callbacks: [],
  };
}

function route(method, endpoint, responses, documentation = '') {
  return {
    uuid: randomUUID(),
    type: 'http',
    documentation,
    method,
    endpoint,
    responses,
    responseMode: null,
    streamingMode: null,
    streamingInterval: 0,
  };
}

function addRoute(environment, folderName, routeDef) {
  const folder = environment.foldersByName.get(folderName);
  environment.routes.push(routeDef);
  folder.children.push({ uuid: routeDef.uuid, type: 'route' });
}

function makeFolder(name) {
  return {
    uuid: randomUUID(),
    name,
    children: [],
  };
}

function maskOwnerId(ownerId) {
  const raw = String(ownerId || '');
  if (raw.length <= 6) return `${raw}****`;
  return `${raw.slice(0, 6)}******`;
}

function addOnsCatalog(car) {
  const isEhailing = car.scenario === 'ehailing';
  return [
    {
      id: 'windscreen',
      name: 'Windscreen Protection',
      price: 100,
      mandatory: false,
      recommended: true,
    },
    {
      id: 'flood',
      name: 'Special Perils (Flood)',
      price: 50,
      mandatory: false,
      recommended: car.scenario === 'flood_prone',
    },
    {
      id: 'ehailing',
      name: 'E-hailing Cover',
      price: 500,
      mandatory: isEhailing,
      recommended: isEhailing,
    },
  ];
}

function underwritingDecision(car, insurerCode) {
  if (car.scenario === 'underwriting_referral' && insurerCode === 'ALLIANZ') {
    return {
      decision: 'REFERRED',
      reasons: ['High-value risk profile requires manual underwriter review.'],
    };
  }
  return {
    decision: 'ACCEPTED',
    reasons: [],
  };
}

function quoteRowsForCar(car) {
  const loading = SCENARIO_LOADING[car.scenario] || 0;

  return Object.entries(BASE_PREMIUMS).map(([code, baseInfo]) => {
    const decision = underwritingDecision(car, code);
    const loadedFinal = baseInfo.final + loading;

    return {
      quote_id: `QT-${car.sampleId}-${code.slice(0, 3)}-001`,
      insurer: {
        code,
        name: baseInfo.name,
      },
      underwriting: decision,
      coverage: {
        type: 'COMPREHENSIVE',
        sum_insured: baseInfo.sumInsured,
      },
      premium: {
        base: baseInfo.base,
        ncd_percent: car.ncd,
        ncd_amount: Number((baseInfo.base - baseInfo.final).toFixed(2)),
        loadings: loading > 0
          ? [{ type: 'risk_loading', amount: loading }]
          : [],
        final: loadedFinal,
        currency: 'MYR',
      },
      addons_catalog: addOnsCatalog(car),
    };
  });
}

function vehicleLookupData(car) {
  return {
    sample_id: car.sampleId,
    vehicle_ref_id: `veh-${car.sampleId.toLowerCase()}`,
    plate_number: car.plate,
    owner_id_type: car.ownerIdType,
    owner_id_masked: maskOwnerId(car.ownerId),
    usage_type: car.scenario === 'ehailing' ? 'ehailing' : 'private',
    vehicle: {
      make: car.make,
      model: car.model,
      year: car.year,
      engine_cc: car.cc,
    },
    address: {
      postcode: car.postcode,
      city: car.city,
      state: car.state,
    },
    ncd_percent: car.ncd,
    eligibility: {
      renewal_allowed: car.scenario !== 'decline',
      printed_roadtax_allowed: car.printedRoadTaxEligible,
      underwriting_referral: car.scenario === 'underwriting_referral',
    },
  };
}

function quoteJobData(car) {
  return {
    job_id: `JOB-${car.sampleId}-0001`,
    status: 'PENDING',
    poll_url: `/v1/quotes/jobs/JOB-${car.sampleId}-0001`,
    result_url: `/v1/quotes/jobs/JOB-${car.sampleId}-0001/result`,
    expires_in_seconds: 1800,
  };
}

function quoteResultData(car) {
  if (car.scenario === 'decline') return null;

  return {
    job_id: `JOB-${car.sampleId}-0001`,
    sample_id: car.sampleId,
    quote_valid_until: '2026-03-06T10:30:00Z',
    roadtax_options: [
      {
        id: 'digital_12m',
        name: '12 Months Digital Road Tax',
        total_price: 90,
        eligible: true,
      },
      {
        id: 'printed_12m',
        name: '12 Months Printed Road Tax',
        total_price: 100,
        eligible: car.printedRoadTaxEligible,
      },
      {
        id: 'none',
        name: 'No Road Tax Renewal',
        total_price: 0,
        eligible: true,
      },
    ],
    quotes: quoteRowsForCar(car),
    notes: [
      'From 1 Feb 2026, printed road tax is available only for foreign_id or company_reg vehicle ownership.',
    ],
  };
}

function buildEnvironment() {
  const folderNames = [
    '01 Auth',
    '02 Reference',
    '03 Vehicle',
    '04 Quotes',
    '05 Proposal',
    '06 Payment',
    '07 Policy',
    '08 Simulation',
  ];

  const folders = folderNames.map(makeFolder);
  const foldersByName = new Map(folders.map((f) => [f.name, f]));

  const envBuildState = {
    foldersByName,
    routes: [],
  };

  // 01 Auth
  addRoute(
    envBuildState,
    '01 Auth',
    route('post', '/oauth/token', [
      response({
        label: 'TOKEN_SUCCESS',
        statusCode: 200,
        latency: 120,
        rulesOperator: 'AND',
        rules: [
          rule('body', 'client_id', 'lajoo-client'),
          rule('body', 'client_secret', 'lajoo-secret'),
          rule('body', 'grant_type', 'client_credentials'),
        ],
        body: envelope('req-auth-001', {
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'vehicle quotes proposals payments policies',
        }),
      }),
      response({
        label: 'INVALID_CLIENT',
        statusCode: 401,
        defaultResponse: true,
        body: envelope('req-auth-401', null, [
          {
            code: 'INVALID_CLIENT',
            message: 'Invalid client credentials.',
            field: 'client_id/client_secret',
            retriable: false,
          },
        ]),
      }),
    ], 'OAuth2-style token issue endpoint for sandbox authentication.')
  );

  addRoute(
    envBuildState,
    '01 Auth',
    route('get', '/health', [
      response({
        label: 'HEALTH_OK',
        statusCode: 200,
        defaultResponse: true,
        body: envelope('req-health-001', {
          status: 'UP',
          service: 'lajoo-insurer-sandbox',
        }),
      }),
    ], 'Health probe endpoint.')
  );

  // 02 Reference
  addRoute(
    envBuildState,
    '02 Reference',
    route('get', '/reference/insurers', [
      response({
        label: 'INSURER_REFERENCE',
        statusCode: 200,
        defaultResponse: true,
        body: envelope('req-ref-ins-001', {
          insurers: [
            { code: 'TAKAFUL', name: 'Takaful Ikhlas', type: 'takaful' },
            { code: 'ETIQA', name: 'Etiqa Insurance', type: 'conventional' },
            { code: 'ALLIANZ', name: 'Allianz Insurance', type: 'conventional' },
          ],
        }),
      }),
    ])
  );

  addRoute(
    envBuildState,
    '02 Reference',
    route('get', '/reference/addons', [
      response({
        label: 'ADDON_REFERENCE',
        statusCode: 200,
        defaultResponse: true,
        body: envelope('req-ref-addon-001', {
          addons: [
            {
              id: 'windscreen',
              name: 'Windscreen Protection',
              price: 100,
              description: 'Covers windscreen damage without affecting NCD.',
            },
            {
              id: 'flood',
              name: 'Special Perils (Flood)',
              price: 50,
              description: 'Covers flood and natural disaster losses.',
            },
            {
              id: 'ehailing',
              name: 'E-hailing Cover',
              price: 500,
              description: 'Required for commercial e-hailing usage.',
            },
          ],
        }),
      }),
    ])
  );

  addRoute(
    envBuildState,
    '02 Reference',
    route('get', '/reference/roadtax-rules', [
      response({
        label: 'ROADTAX_RULES',
        statusCode: 200,
        defaultResponse: true,
        body: envelope('req-ref-roadtax-001', {
          effective_date: '2026-02-01',
          options: [
            { id: 'digital_12m', total_price: 90, eligible_owner_id_types: ['nric', 'foreign_id', 'company_reg'] },
            { id: 'printed_12m', total_price: 100, eligible_owner_id_types: ['foreign_id', 'company_reg'] },
            { id: 'none', total_price: 0, eligible_owner_id_types: ['nric', 'foreign_id', 'company_reg'] },
          ],
        }),
      }),
    ])
  );

  addRoute(
    envBuildState,
    '02 Reference',
    route('get', '/reference/error-codes', [
      response({
        label: 'ERROR_CATALOG',
        statusCode: 200,
        defaultResponse: true,
        body: envelope('req-ref-errors-001', {
          errors: [
            'UNAUTHORIZED',
            'VALIDATION_ERROR',
            'VEHICLE_NOT_FOUND',
            'IDEMPOTENCY_KEY_REQUIRED',
            'QUOTE_JOB_NOT_READY',
            'ROADTAX_PRINTED_NOT_ELIGIBLE',
            'UW_DECLINED',
            'RATE_LIMITED',
            'INTERNAL_ERROR',
          ],
        }),
      }),
    ])
  );

  // 03 Vehicle
  const vehicleResponses = [
    response({
      label: 'UNAUTHORIZED',
      statusCode: 401,
      rules: [rule('header', 'authorization', AUTH_TOKEN, 'equals', true)],
      body: envelope('req-veh-401', null, [
        {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid bearer token.',
          field: 'Authorization',
          retriable: false,
        },
      ]),
    }),
    response({
      label: 'VALIDATION_ERROR_MISSING_PLATE',
      statusCode: 422,
      rules: [rule('body', 'plate_number', '.+', 'regex', true)],
      body: envelope('req-veh-422a', null, [
        {
          code: 'VALIDATION_ERROR',
          message: 'plate_number is required.',
          field: 'plate_number',
          retriable: false,
        },
      ]),
    }),
    response({
      label: 'VALIDATION_ERROR_MISSING_OWNER_ID',
      statusCode: 422,
      rules: [rule('body', 'owner_id', '.+', 'regex', true)],
      body: envelope('req-veh-422b', null, [
        {
          code: 'VALIDATION_ERROR',
          message: 'owner_id is required.',
          field: 'owner_id',
          retriable: false,
        },
      ]),
    }),
  ];

  CARS.forEach((car) => {
    vehicleResponses.push(
      response({
        label: `${car.sampleId}_FOUND`,
        statusCode: 200,
        latency: 320,
        rulesOperator: 'AND',
        rules: [
          rule('body', 'plate_number', car.plate),
          rule('body', 'owner_id', car.ownerId),
        ],
        body: envelope(`req-veh-${car.sampleId.toLowerCase()}`, vehicleLookupData(car)),
      })
    );
  });

  vehicleResponses.push(
    response({
      label: 'VEHICLE_NOT_FOUND',
      statusCode: 404,
      defaultResponse: true,
      body: envelope('req-veh-404', null, [
        {
          code: 'VEHICLE_NOT_FOUND',
          message: 'No record found for provided plate and owner ID.',
          field: 'plate_number/owner_id',
          retriable: false,
        },
      ]),
    })
  );

  addRoute(
    envBuildState,
    '03 Vehicle',
    route('post', '/vehicle/lookup', vehicleResponses, 'Strict sample lookup by plate + owner ID pair.')
  );

  // 04 Quotes
  const quoteJobResponses = [
    response({
      label: 'UNAUTHORIZED',
      statusCode: 401,
      rules: [rule('header', 'authorization', AUTH_TOKEN, 'equals', true)],
      body: envelope('req-qjob-401', null, [
        {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid bearer token.',
          field: 'Authorization',
          retriable: false,
        },
      ]),
    }),
    response({
      label: 'IDEMPOTENCY_KEY_REQUIRED',
      statusCode: 400,
      rules: [rule('header', 'idempotency-key', '.+', 'regex', true)],
      body: envelope('req-qjob-400', null, [
        {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Idempotency-Key header is required for quote job creation.',
          field: 'Idempotency-Key',
          retriable: false,
        },
      ]),
    }),
    response({
      label: 'VALIDATION_ERROR_MISSING_VEHICLE_REF',
      statusCode: 422,
      rules: [rule('body', 'vehicle_ref_id', '.+', 'regex', true)],
      body: envelope('req-qjob-422', null, [
        {
          code: 'VALIDATION_ERROR',
          message: 'vehicle_ref_id is required.',
          field: 'vehicle_ref_id',
          retriable: false,
        },
      ]),
    }),
  ];

  CARS.forEach((car) => {
    quoteJobResponses.push(
      response({
        label: `${car.sampleId}_JOB_CREATED`,
        statusCode: 202,
        latency: 650,
        rulesOperator: 'OR',
        rules: [
          rule('body', 'sample_id', car.sampleId),
          rule('body', 'vehicle_ref_id', `veh-${car.sampleId.toLowerCase()}`),
        ],
        body: envelope(`req-qjob-${car.sampleId.toLowerCase()}`, quoteJobData(car)),
      })
    );
  });

  quoteJobResponses.push(
    response({
      label: 'UNKNOWN_VEHICLE_REF',
      statusCode: 404,
      defaultResponse: true,
      body: envelope('req-qjob-404', null, [
        {
          code: 'VEHICLE_NOT_FOUND',
          message: 'vehicle_ref_id is not recognized in sandbox records.',
          field: 'vehicle_ref_id',
          retriable: false,
        },
      ]),
    })
  );

  addRoute(
    envBuildState,
    '04 Quotes',
    route('post', '/quotes/jobs', quoteJobResponses, 'Creates async quote job for a known vehicle reference.')
  );

  addRoute(
    envBuildState,
    '04 Quotes',
    route('get', '/quotes/jobs/:jobId', [
      response({
        label: 'UNAUTHORIZED',
        statusCode: 401,
        rules: [rule('header', 'authorization', AUTH_TOKEN, 'equals', true)],
        body: envelope('req-qstatus-401', null, [
          {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid bearer token.',
            field: 'Authorization',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'JOB_NOT_FOUND',
        statusCode: 404,
        rules: [rule('params', 'jobId', '^JOB-CAR(0[1-9]|10)-0001$', 'regex', true)],
        body: envelope('req-qstatus-404', null, [
          {
            code: 'QUOTE_JOB_NOT_FOUND',
            message: 'Quote job ID not found.',
            field: 'jobId',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'JOB_COMPLETED',
        statusCode: 200,
        rules: [rule('query', 'stage', 'done')],
        body: envelope('req-qstatus-200b', {
          job_id: 'JOB-CAR01-0001',
          status: 'COMPLETED',
          progress_percent: 100,
        }),
      }),
      response({
        label: 'JOB_PROCESSING',
        statusCode: 200,
        defaultResponse: true,
        body: envelope('req-qstatus-200a', {
          job_id: 'JOB-CAR01-0001',
          status: 'PROCESSING',
          progress_percent: 60,
        }),
      }),
    ], 'Query quote-job lifecycle state; add ?stage=done for deterministic completion.')
  );

  const quoteResultResponses = [
    response({
      label: 'UNAUTHORIZED',
      statusCode: 401,
      rules: [rule('header', 'authorization', AUTH_TOKEN, 'equals', true)],
      body: envelope('req-qresult-401', null, [
        {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid bearer token.',
          field: 'Authorization',
          retriable: false,
        },
      ]),
    }),
    response({
      label: 'JOB_NOT_FOUND',
      statusCode: 404,
      rules: [rule('params', 'jobId', '^JOB-CAR(0[1-9]|10)-0001$', 'regex', true)],
      body: envelope('req-qresult-404', null, [
        {
          code: 'QUOTE_JOB_NOT_FOUND',
          message: 'Quote job ID not found.',
          field: 'jobId',
          retriable: false,
        },
      ]),
    }),
    response({
      label: 'JOB_NOT_READY',
      statusCode: 409,
      rules: [rule('query', 'ready', '0')],
      body: envelope('req-qresult-409', null, [
        {
          code: 'QUOTE_JOB_NOT_READY',
          message: 'Quote job is not completed yet.',
          field: 'jobId',
          retriable: true,
        },
      ]),
    }),
  ];

  CARS.forEach((car) => {
    if (car.scenario === 'decline') {
      quoteResultResponses.push(
        response({
          label: `${car.sampleId}_UW_DECLINED`,
          statusCode: 409,
          rules: [rule('params', 'jobId', `JOB-${car.sampleId}-0001`)],
          body: envelope(`req-qresult-${car.sampleId.toLowerCase()}`, null, [
            {
              code: 'UW_DECLINED',
              message: 'Risk does not meet underwriting acceptance criteria.',
              field: 'vehicle_ref_id',
              retriable: false,
            },
          ]),
        })
      );
    } else {
      quoteResultResponses.push(
        response({
          label: `${car.sampleId}_QUOTE_RESULT`,
          statusCode: 200,
          latency: 900,
          rules: [rule('params', 'jobId', `JOB-${car.sampleId}-0001`)],
          body: envelope(`req-qresult-${car.sampleId.toLowerCase()}`, quoteResultData(car)),
        })
      );
    }
  });

  quoteResultResponses.push(
    response({
      label: 'QUOTE_RESULT_FALLBACK_NOT_FOUND',
      statusCode: 404,
      defaultResponse: true,
      body: envelope('req-qresult-404b', null, [
        {
          code: 'QUOTE_JOB_NOT_FOUND',
          message: 'Quote result not found for job ID.',
          field: 'jobId',
          retriable: false,
        },
      ]),
    })
  );

  addRoute(
    envBuildState,
    '04 Quotes',
    route('get', '/quotes/jobs/:jobId/result', quoteResultResponses, 'Returns insurer quote cards. Use ?ready=0 to force not-ready error.')
  );

  addRoute(
    envBuildState,
    '04 Quotes',
    route('post', '/quotes/:quoteId/reprice', [
      response({
        label: 'UNAUTHORIZED',
        statusCode: 401,
        rules: [rule('header', 'authorization', AUTH_TOKEN, 'equals', true)],
        body: envelope('req-reprice-401', null, [
          {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid bearer token.',
            field: 'Authorization',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'VALIDATION_ERROR_MISSING_ROADTAX_OPTION',
        statusCode: 422,
        rules: [rule('body', 'roadtax_option', '.+', 'regex', true)],
        body: envelope('req-reprice-422', null, [
          {
            code: 'VALIDATION_ERROR',
            message: 'roadtax_option is required.',
            field: 'roadtax_option',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'ROADTAX_PRINTED_NOT_ELIGIBLE',
        statusCode: 409,
        rulesOperator: 'AND',
        rules: [
          rule('body', 'roadtax_option', 'printed_12m'),
          rule('body', 'owner_id_type', 'nric'),
        ],
        body: envelope('req-reprice-409', null, [
          {
            code: 'ROADTAX_PRINTED_NOT_ELIGIBLE',
            message: 'Printed road tax is available only for foreign_id or company_reg ownership.',
            field: 'roadtax_option',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'REPRICE_PRINTED_ELIGIBLE_SUCCESS',
        statusCode: 200,
        rulesOperator: 'AND',
        rules: [
          rule('body', 'roadtax_option', 'printed_12m'),
          rule('body', 'owner_id_type', '^(foreign_id|company_reg)$', 'regex'),
        ],
        body: envelope('req-reprice-200b', {
          quote_id: 'QT-CAR01-TAK-001',
          breakdown: {
            insurance_premium: 796,
            addons_total: 150,
            roadtax_total: 100,
          },
          grand_total: 1046,
          currency: 'MYR',
          notes: ['Printed road tax fee includes handling and delivery charge.'],
        }),
      }),
      response({
        label: 'REPRICE_NO_ROADTAX',
        statusCode: 200,
        rules: [rule('body', 'roadtax_option', 'none')],
        body: envelope('req-reprice-200c', {
          quote_id: 'QT-CAR01-TAK-001',
          breakdown: {
            insurance_premium: 796,
            addons_total: 150,
            roadtax_total: 0,
          },
          grand_total: 946,
          currency: 'MYR',
        }),
      }),
      response({
        label: 'REPRICE_DIGITAL_SUCCESS',
        statusCode: 200,
        defaultResponse: true,
        body: envelope('req-reprice-200a', {
          quote_id: 'QT-CAR01-TAK-001',
          breakdown: {
            insurance_premium: 796,
            addons_total: 150,
            roadtax_total: 90,
          },
          grand_total: 1036,
          currency: 'MYR',
        }),
      }),
    ], 'Final payable breakdown endpoint; supports digital/printed/none road-tax option checks.')
  );

  // 05 Proposal
  addRoute(
    envBuildState,
    '05 Proposal',
    route('post', '/proposals', [
      response({
        label: 'UNAUTHORIZED',
        statusCode: 401,
        rules: [rule('header', 'authorization', AUTH_TOKEN, 'equals', true)],
        body: envelope('req-prop-401', null, [
          {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid bearer token.',
            field: 'Authorization',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'IDEMPOTENCY_KEY_REQUIRED',
        statusCode: 400,
        rules: [rule('header', 'idempotency-key', '.+', 'regex', true)],
        body: envelope('req-prop-400', null, [
          {
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'Idempotency-Key header is required for proposal creation.',
            field: 'Idempotency-Key',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'VALIDATION_MISSING_QUOTE_ID',
        statusCode: 422,
        rules: [rule('body', 'quote_id', '.+', 'regex', true)],
        body: envelope('req-prop-422a', null, [
          {
            code: 'VALIDATION_ERROR',
            message: 'quote_id is required.',
            field: 'quote_id',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'VALIDATION_MISSING_CUSTOMER_EMAIL',
        statusCode: 422,
        rules: [rule('body', 'customer.email', '.+', 'regex', true)],
        body: envelope('req-prop-422b', null, [
          {
            code: 'VALIDATION_ERROR',
            message: 'customer.email is required.',
            field: 'customer.email',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'PROPOSAL_CREATED',
        statusCode: 201,
        defaultResponse: true,
        body: envelope('req-prop-201', {
          proposal_id: 'PRP-0001',
          status: 'DRAFT',
          quote_id: 'QT-CAR01-TAK-001',
        }),
      }),
    ], 'Proposal creation endpoint after quote selection and repricing.')
  );

  addRoute(
    envBuildState,
    '05 Proposal',
    route('post', '/proposals/:proposalId/submit', [
      response({
        label: 'UNAUTHORIZED',
        statusCode: 401,
        rules: [rule('header', 'authorization', AUTH_TOKEN, 'equals', true)],
        body: envelope('req-prop-submit-401', null, [
          {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid bearer token.',
            field: 'Authorization',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'PROPOSAL_SUBMITTED',
        statusCode: 200,
        defaultResponse: true,
        body: envelope('req-prop-submit-200', {
          proposal_id: 'PRP-0001',
          status: 'SUBMITTED',
        }),
      }),
    ])
  );

  // 06 Payment
  addRoute(
    envBuildState,
    '06 Payment',
    route('post', '/payments/intents', [
      response({
        label: 'UNAUTHORIZED',
        statusCode: 401,
        rules: [rule('header', 'authorization', AUTH_TOKEN, 'equals', true)],
        body: envelope('req-pay-401', null, [
          {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid bearer token.',
            field: 'Authorization',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'IDEMPOTENCY_KEY_REQUIRED',
        statusCode: 400,
        rules: [rule('header', 'idempotency-key', '.+', 'regex', true)],
        body: envelope('req-pay-400', null, [
          {
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'Idempotency-Key header is required for payment-intent creation.',
            field: 'Idempotency-Key',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'VALIDATION_MISSING_PROPOSAL_ID',
        statusCode: 422,
        rules: [rule('body', 'proposal_id', '.+', 'regex', true)],
        body: envelope('req-pay-422', null, [
          {
            code: 'VALIDATION_ERROR',
            message: 'proposal_id is required.',
            field: 'proposal_id',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'PAYMENT_INTENT_CREATED',
        statusCode: 201,
        defaultResponse: true,
        body: envelope('req-pay-201', {
          payment_intent_id: 'PAY-INT-0001',
          status: 'PENDING',
          amount: 1036,
          currency: 'MYR',
          methods_available: ['card', 'fpx', 'ewallet', 'bnpl'],
        }),
      }),
    ], 'Payment intent for proposal checkout.')
  );

  addRoute(
    envBuildState,
    '06 Payment',
    route('post', '/payments/intents/:paymentIntentId/confirm', [
      response({
        label: 'UNAUTHORIZED',
        statusCode: 401,
        rules: [rule('header', 'authorization', AUTH_TOKEN, 'equals', true)],
        body: envelope('req-pay-confirm-401', null, [
          {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid bearer token.',
            field: 'Authorization',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'PAYMENT_DECLINED',
        statusCode: 402,
        rules: [rule('body', 'simulate', 'decline')],
        body: envelope('req-pay-confirm-402', null, [
          {
            code: 'PAYMENT_DECLINED',
            message: 'Issuer declined the payment authorization.',
            field: 'payment_method',
            retriable: true,
          },
        ]),
      }),
      response({
        label: 'PAYMENT_TIMEOUT',
        statusCode: 503,
        rules: [rule('body', 'simulate', 'timeout')],
        body: envelope('req-pay-confirm-503', null, [
          {
            code: 'DOWNSTREAM_TIMEOUT',
            message: 'Payment gateway timeout. Retry is allowed.',
            field: 'gateway',
            retriable: true,
          },
        ]),
      }),
      response({
        label: 'PAYMENT_CONFIRMED',
        statusCode: 200,
        defaultResponse: true,
        body: envelope('req-pay-confirm-200', {
          payment_intent_id: 'PAY-INT-0001',
          status: 'PAID',
          paid_at: STATIC_TIMESTAMP,
        }),
      }),
    ], 'Confirms payment intent; supports simulated failure modes.')
  );

  // 07 Policy
  addRoute(
    envBuildState,
    '07 Policy',
    route('post', '/policies/issue', [
      response({
        label: 'UNAUTHORIZED',
        statusCode: 401,
        rules: [rule('header', 'authorization', AUTH_TOKEN, 'equals', true)],
        body: envelope('req-policy-401', null, [
          {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid bearer token.',
            field: 'Authorization',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'IDEMPOTENCY_KEY_REQUIRED',
        statusCode: 400,
        rules: [rule('header', 'idempotency-key', '.+', 'regex', true)],
        body: envelope('req-policy-400', null, [
          {
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'Idempotency-Key header is required for policy issuance.',
            field: 'Idempotency-Key',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'VALIDATION_MISSING_PROPOSAL_ID',
        statusCode: 422,
        rules: [rule('body', 'proposal_id', '.+', 'regex', true)],
        body: envelope('req-policy-422', null, [
          {
            code: 'VALIDATION_ERROR',
            message: 'proposal_id is required.',
            field: 'proposal_id',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'PAYMENT_NOT_SUCCESSFUL',
        statusCode: 409,
        rules: [rule('body', 'payment_status', 'PAID', 'equals', true)],
        body: envelope('req-policy-409', null, [
          {
            code: 'PAYMENT_NOT_SUCCESSFUL',
            message: 'Payment must be PAID before policy issuance.',
            field: 'payment_status',
            retriable: false,
          },
        ]),
      }),
      response({
        label: 'POLICY_ISSUED',
        statusCode: 201,
        defaultResponse: true,
        body: envelope('req-policy-201', {
          policy_number: 'POL-2026-000001',
          status: 'ISSUED',
          effective_date: '2026-04-05',
          expiry_date: '2027-04-04',
          documents: [
            {
              type: 'schedule',
              url: '/v1/policies/POL-2026-000001/documents/schedule.pdf',
            },
            {
              type: 'receipt',
              url: '/v1/policies/POL-2026-000001/documents/receipt.pdf',
            },
          ],
        }),
      }),
    ], 'Issues policy when payment is complete.')
  );

  // 08 Simulation
  addRoute(
    envBuildState,
    '08 Simulation',
    route('get', '/simulate/rate-limit', [
      response({
        label: 'RATE_LIMITED',
        statusCode: 429,
        defaultResponse: true,
        headers: [{ key: 'Retry-After', value: '30' }],
        body: envelope('req-sim-429', null, [
          {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Retry later.',
            field: null,
            retriable: true,
          },
        ]),
      }),
    ])
  );

  addRoute(
    envBuildState,
    '08 Simulation',
    route('get', '/simulate/downstream-timeout', [
      response({
        label: 'DOWNSTREAM_TIMEOUT',
        statusCode: 503,
        defaultResponse: true,
        body: envelope('req-sim-503', null, [
          {
            code: 'DOWNSTREAM_TIMEOUT',
            message: 'Dependent system timeout encountered.',
            field: null,
            retriable: true,
          },
        ]),
      }),
    ])
  );

  addRoute(
    envBuildState,
    '08 Simulation',
    route('get', '/simulate/internal-error', [
      response({
        label: 'INTERNAL_ERROR',
        statusCode: 500,
        defaultResponse: true,
        body: envelope('req-sim-500', null, [
          {
            code: 'INTERNAL_ERROR',
            message: 'Unexpected internal server error.',
            field: null,
            retriable: true,
          },
        ]),
      }),
    ])
  );

  addRoute(
    envBuildState,
    '08 Simulation',
    route('get', '/simulate/unauthorized', [
      response({
        label: 'UNAUTHORIZED',
        statusCode: 401,
        defaultResponse: true,
        body: envelope('req-sim-401', null, [
          {
            code: 'UNAUTHORIZED',
            message: 'Unauthorized simulation endpoint response.',
            field: 'Authorization',
            retriable: false,
          },
        ]),
      }),
    ])
  );

  const environment = {
    uuid: randomUUID(),
    lastMigration: 33,
    name: 'Lajoo Insurer Sandbox (Production-Style Mock)',
    endpointPrefix: '/v1',
    latency: 0,
    port: 4001,
    hostname: '',
    folders,
    routes: envBuildState.routes,
    rootChildren: folders.map((folder) => ({ uuid: folder.uuid, type: 'folder' })),
    proxyMode: false,
    proxyHost: '',
    proxyRemovePrefix: false,
    tlsOptions: {
      enabled: false,
      type: 'CERT',
      pfxPath: '',
      certPath: '',
      keyPath: '',
      caPath: '',
      passphrase: '',
      requestCert: false,
      rejectUnauthorized: false,
    },
    cors: true,
    headers: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'X-Mock-Provider', value: 'mockoon-lajoo-insurer' },
    ],
    proxyReqHeaders: [],
    proxyResHeaders: [],
    data: [],
    callbacks: [],
  };

  return environment;
}

async function main() {
  const env = buildEnvironment();
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(env, null, 2)}\n`, 'utf8');
  console.log(`Wrote Mockoon environment: ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error('Failed to generate environment file:', err);
  process.exitCode = 1;
});
