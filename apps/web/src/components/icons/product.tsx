/**
 * Product icons. Phosphor duotone for places users look (nav, hubs, tiles,
 * provenance). Keep lucide-react for shadcn / form chrome (X, Check, Chevron…).
 *
 * Usage: `<WalletIcon className="size-5" />` or
 * `<ProductIcon icon={Wallet} className="size-5" />`
 */
import {
  ArrowCounterClockwise,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowsClockwise,
  Baby,
  Bank,
  Bell,
  BellRinging,
  Briefcase,
  CalendarBlank,
  CalendarX,
  Camera,
  CaretRight,
  ChartBar,
  ChatCircle,
  ClipboardText,
  ClockCountdown,
  ClockCounterClockwise,
  DeviceMobile,
  Download,
  Fingerprint,
  Flag,
  Lightbulb,
  Lock,
  MagicWand,
  Microphone,
  Monitor,
  Moon,
  Notebook,
  Path,
  PiggyBank,
  Plus,
  Receipt,
  Robot,
  Scissors,
  ShareNetwork,
  SignOut,
  Sparkle,
  SquaresFour,
  Sun,
  Target,
  Ticket,
  TrendDown,
  TrendUp,
  Trophy,
  User,
  Users,
  Wallet,
  type Icon,
  type IconProps,
  type IconWeight,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export type ProductIconComponent = Icon
export type { Icon, IconWeight }

/** Default weight for product surfaces (nav, tiles, hub heroes). */
export const PRODUCT_ICON_WEIGHT: IconWeight = 'duotone'

type ProductIconProps = IconProps & {
  icon: Icon
  /** Defaults to duotone for brand warmth; use "regular" for dense lists. */
  weight?: IconWeight
}

export function ProductIcon({
  icon: Glyph,
  weight = PRODUCT_ICON_WEIGHT,
  className,
  ...rest
}: ProductIconProps) {
  return <Glyph weight={weight} className={cn('shrink-0', className)} {...rest} />
}

/** Convenience wrappers so call sites stay readable. */
function make(icon: Icon) {
  return function NamedProductIcon({
    weight = PRODUCT_ICON_WEIGHT,
    className,
    ...rest
  }: Omit<IconProps, 'weight'> & { weight?: IconWeight }) {
    return <ProductIcon icon={icon} weight={weight} className={className} {...rest} />
  }
}

export const WalletIcon = make(Wallet)
export const PiggyBankIcon = make(PiggyBank)
export const TargetIcon = make(Target)
export const ChartBarIcon = make(ChartBar)
export const SparkleIcon = make(Sparkle)
export const MagicWandIcon = make(MagicWand)
export const SquaresFourIcon = make(SquaresFour)
export const ChatCircleIcon = make(ChatCircle)
export const TrophyIcon = make(Trophy)
export const ClipboardTextIcon = make(ClipboardText)
export const CameraIcon = make(Camera)
export const CalendarBlankIcon = make(CalendarBlank)
export const NotebookIcon = make(Notebook)
export const PathIcon = make(Path)
export const FlagIcon = make(Flag)
export const BriefcaseIcon = make(Briefcase)
export const UsersIcon = make(Users)
export const UserIcon = make(User)
export const BabyIcon = make(Baby)
export const MicrophoneIcon = make(Microphone)
export const DeviceMobileIcon = make(DeviceMobile)
export const ArrowsClockwiseIcon = make(ArrowsClockwise)
export const TrendDownIcon = make(TrendDown)
export const TrendUpIcon = make(TrendUp)
export const CalendarXIcon = make(CalendarX)
export const LightbulbIcon = make(Lightbulb)
export const LockIcon = make(Lock)
export const FingerprintIcon = make(Fingerprint)
export const SunIcon = make(Sun)
export const MoonIcon = make(Moon)
export const MonitorIcon = make(Monitor)
export const DownloadIcon = make(Download)
export const ShareNetworkIcon = make(ShareNetwork)
export const ClockCounterClockwiseIcon = make(ClockCounterClockwise)
export const ClockCountdownIcon = make(ClockCountdown)
export const CaretRightIcon = make(CaretRight)
export const ReceiptIcon = make(Receipt)
export const BankIcon = make(Bank)
export const TicketIcon = make(Ticket)
export const SignOutIcon = make(SignOut)
export const BellIcon = make(Bell)
export const BellRingingIcon = make(BellRinging)
export const PlusIcon = make(Plus)
export const ScissorsIcon = make(Scissors)
export const ArrowCounterClockwiseIcon = make(ArrowCounterClockwise)
export const RobotIcon = make(Robot)
export const ArrowDownLeftIcon = make(ArrowDownLeft)
export const ArrowUpRightIcon = make(ArrowUpRight)

// Re-export raw glyphs for maps / config objects that need `Icon` references.
export {
  Wallet,
  PiggyBank,
  Target,
  ChartBar,
  Sparkle,
  MagicWand,
  SquaresFour,
  ChatCircle,
  Trophy,
  ClipboardText,
  Camera,
  CalendarBlank,
  Notebook,
  Path,
  Flag,
  Briefcase,
  Users,
  User,
  Baby,
  Microphone,
  DeviceMobile,
  ArrowsClockwise,
  TrendDown,
  TrendUp,
  CalendarX,
  Lightbulb,
  Lock,
  Fingerprint,
  Sun,
  Moon,
  Monitor,
  Download,
  ShareNetwork,
  ClockCounterClockwise,
  ClockCountdown,
  CaretRight,
  Receipt,
  Bank,
  Ticket,
  SignOut,
  Bell,
  BellRinging,
  Plus,
  Scissors,
  ArrowCounterClockwise,
  Robot,
  ArrowDownLeft,
  ArrowUpRight,
}
