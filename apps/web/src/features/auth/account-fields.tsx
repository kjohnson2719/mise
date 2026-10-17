import type {
  FieldErrors,
  FieldValues,
  Path,
  UseFormRegister,
} from "react-hook-form"
import { useTranslation } from "react-i18next"

import { TextField } from "@/components/form/text-field"

export type AccountForm = {
  name: string
  email: string
  username: string
  password: string
}

export const EMPTY_ACCOUNT: AccountForm = {
  name: "",
  email: "",
  username: "",
  password: "",
}

/** The fields for a new account, shared by setup and joining. */
export function AccountFields<T extends FieldValues & AccountForm>({
  register,
  errors,
}: {
  register: UseFormRegister<T>
  errors: FieldErrors<T>
}) {
  const { t } = useTranslation()
  const field = (name: keyof AccountForm) => ({
    ...register(name as Path<T>),
    error: errors[name]?.message as string | undefined,
  })

  return (
    <>
      <TextField
        label={t("auth.fields.name")}
        autoComplete="name"
        {...field("name")}
      />
      <TextField
        label={t("auth.fields.email")}
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        {...field("email")}
      />
      <TextField
        label={t("auth.fields.username")}
        description={t("auth.fields.usernameHint")}
        autoComplete="username"
        autoCapitalize="none"
        {...field("username")}
      />
      <TextField
        label={t("auth.fields.password")}
        description={t("auth.fields.passwordHint")}
        type="password"
        autoComplete="new-password"
        {...field("password")}
      />
    </>
  )
}
