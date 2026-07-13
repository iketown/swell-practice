import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex cursor-pointer items-center justify-center gap-2 rounded border-2 border-foreground font-medium whitespace-nowrap shadow-sm transition-[transform,background-color,box-shadow] duration-200 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:not-aria-[haspopup]:translate-x-px active:not-aria-[haspopup]:translate-y-0.5 active:not-aria-[haspopup]:shadow-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-md hover:translate-y-px hover:bg-primary-hover hover:shadow-sm",
        outline:
          "bg-transparent shadow-md hover:translate-y-px hover:bg-accent hover:text-accent-foreground hover:shadow-sm aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-md hover:translate-y-px hover:bg-secondary-hover hover:shadow-sm aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost: "border-transparent bg-transparent shadow-none hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-md hover:translate-y-px hover:bg-destructive/90 hover:shadow-sm",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "px-4 py-1.5 text-base has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "gap-1 rounded-[min(var(--radius-md),12px)] px-3 py-1 text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "gap-1.5 px-6 py-2 text-base lg:px-8 lg:py-3 lg:text-lg",
        icon: "size-8 p-2",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
