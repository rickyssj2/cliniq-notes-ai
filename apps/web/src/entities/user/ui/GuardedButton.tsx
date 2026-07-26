import { can, useRole, type Capability } from "@entities/user";
import { Button, type ButtonProps } from "@shared/ui/button";

type Props = ButtonProps & {
  capability: Capability;
};

/** Action-level guard: disabled + reason, never silently clickable. */
export function GuardedButton({
  capability,
  title,
  children,
  disabled,
  ...rest
}: Props) {
  const role = useRole();
  const access = can(role, capability);

  if (!access.ok) {
    return (
      <span className="inline-flex" title={access.reason}>
        <Button {...rest} disabled aria-disabled title={access.reason}>
          {children}
        </Button>
      </span>
    );
  }

  return (
    <Button {...rest} disabled={disabled} title={title}>
      {children}
    </Button>
  );
}
