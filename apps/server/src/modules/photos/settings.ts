import { choiceSetting, switchSetting } from "../../core/settings.ts"

/** The looks a household can pick for its AI photos. */
export const PHOTO_STYLES = ["marble", "rustic", "bright", "moody"] as const
export type PhotoStyle = (typeof PHOTO_STYLES)[number]

export const PHOTOS = {
  enabled: switchSetting({
    key: "photos.enabled",
    env: "MERRAN_AI_PHOTOS",
    description:
      "Make photos with AI for recipes without one, on a household's OpenAI or Google key: about 1.5¢ a photo with OpenAI, 4¢ with Google. They never replace a real photo.",
    default: false,
  }),
  auto: switchSetting({
    key: "photos.auto",
    env: "MERRAN_AI_PHOTOS_AUTO",
    description:
      "Make one by itself for each recipe added without a photo (typed in, read from text, or from the assistant). Never for a whole library moved in at once.",
    default: true,
  }),
  style: choiceSetting({
    key: "photos.style",
    level: "household",
    choices: PHOTO_STYLES,
    description:
      "How the household's AI photos look, all alike, so the library looks like one cookbook.",
    default: "marble",
  }),
}
