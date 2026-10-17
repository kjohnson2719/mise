import { switchSetting, textSetting } from "../../core/settings.ts"

export const TELEMETRY = {
  enabled: switchSetting({
    key: "telemetry.enabled",
    env: "MERRAN_TELEMETRY",
    description:
      "Send the Merran project an anonymous summary once a day. `off` turns it off for good.",
    default: false,
  }),
  installId: textSetting({
    key: "telemetry.installId",
    internal: true,
    description:
      "A random id for this server, sent with the summary. Making a new one starts afresh.",
  }),
}
