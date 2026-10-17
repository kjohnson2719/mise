// Sample values for the API reference's examples. They tell one story, the
// Riveras' household, so the examples read the same across every route.
// The route tests check each example against its schema.

/** A made-up id in the shape Merran's ids have (UUIDv7). */
const id = (n: number) =>
  `0199e8b0-5a10-7a01-8b00-${n.toString(16).padStart(12, "0")}`

export const IDS = {
  sam: id(1),
  jamie: id(2),
  household: id(3),
  samMember: id(4),
  jamieMember: id(5),
  lemonChicken: id(6),
  garlicRice: id(7),
  tag: id(8),
  apiKey: id(9),
  invite: id(10),
  job: id(11),
  cookNote: id(12),
  version: id(13),
  pairing: id(14),
  tagPairing: id(15),
  session: id(16),
  ingredients: [id(17), id(18), id(19), id(20)],
  steps: [id(21), id(22), id(23)],
  importFile: id(24),
  mealieGroup: id(25),
  otherMealieGroup: id(26),
  planEntry: id(27),
  shoppingList: id(28),
  listItems: [id(29), id(30), id(31)],
  aisles: [id(32), id(33), id(34)],
  everyWeek: id(35),
  otherPlanEntry: id(36),
  costcoList: id(37),
  pantryItems: [id(38), id(39)],
  aiKey: id(40),
  proposal: id(41),
  tidyRun: id(42),
  chat: id(43),
  chatMessage: id(44),
  discovery: id(45),
  receipt: id(46),
  nutritionRun: id(47),
  followedSite: id(48),
  siteRecipe: id(49),
  otherSiteRecipe: id(50),
  photoRun: id(51),
}

export const TIMES = {
  created: "2026-10-01T17:30:00.000Z",
  lastMade: "2026-10-09T01:15:00.000Z",
  now: "2026-10-15T18:30:00.000Z",
  inAWeek: "2026-10-22T18:30:00.000Z",
  inThreeMonths: "2027-01-13T18:30:00.000Z",
}

export const HOUSEHOLD = {
  id: IDS.household,
  name: "The Riveras",
  country: "US",
  currency: "USD",
  timeZone: "America/Phoenix",
  weekStartsOn: 0,
  meals: ["dinner" as const],
  role: "owner" as const,
}

export const ME = {
  id: IDS.sam,
  name: "Sam Rivera",
  email: "sam@example.com",
  username: "sam",
  serverAdmin: true,
  households: [
    { id: IDS.household, name: "The Riveras", role: "owner" as const },
  ],
  activeHouseholdId: IDS.household,
}

export const NEW_ACCOUNT = {
  name: "Jamie Rivera",
  email: "jamie@example.com",
  username: "jamie",
  password: "correct horse battery staple",
}

export const MEMBER = {
  id: IDS.jamieMember,
  userId: IDS.jamie,
  name: "Jamie Rivera",
  username: "jamie",
  role: "admin" as const,
  joinedAt: TIMES.created,
}

export const INVITE_LINK = {
  id: IDS.invite,
  role: "member" as const,
  expiresAt: TIMES.inAWeek,
  createdAt: TIMES.now,
}

export const KEY_PERMISSIONS = { recipes: "read", list: "write" } as const

export const API_KEY = {
  id: IDS.apiKey,
  name: "Home Assistant",
  start: "mrn_3fK9aQ",
  household: { id: IDS.household, name: "The Riveras" },
  permissions: KEY_PERMISSIONS,
  expiresAt: TIMES.inThreeMonths,
  lastUsedAt: TIMES.now,
  createdAt: TIMES.created,
}

export const JOB = {
  id: IDS.job,
  kind: "household.import",
  status: "running" as const,
  scheduled: false,
  householdId: IDS.household,
  progress: { done: 42, total: 128 },
  result: null,
  error: null,
  attempts: 1,
  maxAttempts: 3,
  runAt: TIMES.now,
  startedAt: TIMES.now,
  finishedAt: null,
  createdAt: TIMES.now,
}

export const SETTING = {
  key: "errorTracking.environment",
  kind: "text" as const,
  value: "home",
  default: "production",
  source: "saved" as const,
  lockedBy: null,
}

export const SECRET_SETTING = {
  key: "errorTracking.dsn",
  kind: "secret" as const,
  value: null,
  default: null,
  source: "environment" as const,
  lockedBy: "MERRAN_SENTRY_DSN",
  secret: { set: true, hint: "4f2a", unreadable: false },
}

const photo = (recipeId: string) => ({
  full: `/api/recipes/${recipeId}/photo?size=full&v=4b1c2d3e`,
  card: `/api/recipes/${recipeId}/photo?size=card&v=4b1c2d3e`,
})

export const RECIPE_SUMMARY = {
  id: IDS.lemonChicken,
  slug: "lemon-chicken",
  name: "Lemon Chicken",
  description: "Crisp chicken thighs roasted with lemon, garlic and thyme.",
  servings: 4,
  totalMinutes: 50,
  rating: 5,
  tags: ["chicken", "dinner"],
  diets: [
    "gluten-free" as const,
    "dairy-free" as const,
    "egg-free" as const,
    "nut-free" as const,
  ],
  photo: photo(IDS.lemonChicken),
  lastMadeAt: TIMES.lastMade,
  createdAt: TIMES.created,
  updatedAt: TIMES.now,
}

export const RECIPE = {
  ...RECIPE_SUMMARY,
  origin: "link" as const,
  photoByAi: false,
  sourceUrl: "https://example.com/lemon-chicken",
  yieldText: null,
  prepMinutes: 10,
  cookMinutes: 40,
  notes: "Bone-in thighs work too: give them 10 minutes more.",
  dietOverrides: {},
  needs: [],
  nutrition: {
    source: "calculated" as const,
    calories: 412,
    protein: 31.5,
    carbs: 6.2,
    fat: 28.1,
    fiber: 1.4,
    sugar: 1.2,
    sodium: 640,
    missing: [],
    servings: 4,
  },
  ingredients: [
    {
      id: IDS.ingredients[0],
      section: null,
      text: "2 lb chicken thighs",
      quantity: 2,
      quantityMax: null,
      unit: "pound",
      food: "chicken thighs",
      note: null,
      mark: "needed",
    },
    {
      id: IDS.ingredients[1],
      section: null,
      text: "1 tbsp olive oil",
      quantity: 1,
      quantityMax: null,
      unit: "tablespoon",
      food: "olive oil",
      note: null,
      mark: "optional",
    },
    {
      id: IDS.ingredients[2],
      section: null,
      text: "2 lemons, juiced",
      quantity: 2,
      quantityMax: null,
      unit: null,
      food: "lemons",
      note: "juiced",
      mark: "needed",
    },
    {
      id: IDS.ingredients[3],
      section: null,
      text: "4 cloves garlic, smashed",
      quantity: 4,
      quantityMax: null,
      unit: "clove",
      food: "garlic",
      note: "smashed",
      mark: "swappable",
    },
  ],
  steps: [
    { id: IDS.steps[0], section: null, text: "Heat the oven to 425°F." },
    {
      id: IDS.steps[1],
      section: null,
      text: "Toss the chicken with the oil, lemon juice, garlic, salt and pepper.",
    },
    {
      id: IDS.steps[2],
      section: null,
      text: "Roast skin side up for 40 minutes, until crisp.",
    },
  ],
}

export const RECIPE_INPUT = {
  name: "Lemon Chicken",
  description: "Crisp chicken thighs roasted with lemon, garlic and thyme.",
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 40,
  sourceUrl: "https://example.com/lemon-chicken",
  tags: ["chicken", "dinner"],
  ingredients: [
    "2 lb chicken thighs",
    "1 tbsp olive oil",
    "2 lemons, juiced",
    "4 cloves garlic, smashed",
  ],
  steps: [
    "Heat the oven to 425°F.",
    "Toss the chicken with the oil, lemon juice, garlic, salt and pepper.",
    "Roast skin side up for 40 minutes, until crisp.",
  ],
}

export const PAIR_OPTION = {
  id: IDS.garlicRice,
  slug: "garlic-rice",
  name: "Garlic Rice",
  photo: null,
  servings: 4,
  totalMinutes: 25,
}

export const COOK_NOTE = {
  id: IDS.cookNote,
  rating: 5,
  note: "More lemon next time.",
  by: "Sam Rivera",
  createdAt: TIMES.lastMade,
}

/** As Better Auth describes a person, for its sign-in endpoints. */
export const AUTH_USER = {
  id: IDS.sam,
  name: "Sam Rivera",
  email: "sam@example.com",
  emailVerified: false,
  image: null,
  createdAt: TIMES.created,
  updatedAt: TIMES.created,
  username: "sam",
  displayUsername: "sam",
  role: "admin" as const,
  banned: false,
}

/** As Better Auth describes a session. */
export const AUTH_SESSION = {
  id: IDS.session,
  expiresAt: TIMES.inAWeek,
  token: "sample-session-token",
  createdAt: TIMES.now,
  updatedAt: TIMES.now,
  ipAddress: "192.168.1.20",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
  userId: IDS.sam,
  activeOrganizationId: IDS.household,
}
