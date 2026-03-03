import type { ProjectWizardInput } from "@aldo/shared";
import { validateProjectWizard } from "@aldo/shared";

export const calculateProjectHealth = (input: ProjectWizardInput): "Green" | "Amber" | "Red" => {
  const result = validateProjectWizard(input);
  if (!result.valid) {
    return "Red";
  }

  if (result.issues.length > 0) {
    return "Amber";
  }

  return "Green";
};
