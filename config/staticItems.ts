import type { IStaticMainMenuItem } from "~/types";

export const staticMainMenuItems: IStaticMainMenuItem[] = [
  {
    slug: "actions",
    title: "Акции",
    href: "/stocks",
    isTrigger: false,
    iconName: "lucide:percent",
  },
  {
    slug: "new",
    title: "Новинки",
    href: "/new",
    isTrigger: false,
    iconName: "",
  },
  {
    slug: "boys",
    title: "Мальчикам",
    href: "/catalog/boys",
    isTrigger: true,
    iconName: "lucide:user",
  },
  {
    slug: "girls",
    title: "Девочкам",
    href: "/catalog/girls",
    isTrigger: true,
    iconName: "lucide:female",
  },
  {
    slug: "kiddy",
    title: "Малышам",
    href: "/catalog/kiddy",
    isTrigger: true,
    iconName: "lucide:baby",
  },
  {
    slug: "games",
    title: "Игры",
    href: "/catalog/games",
    isTrigger: true,
    iconName: "lucide:gamepad-2",
  },
  {
    slug: "razvivashki",
    title: "Развивашки",
    href: "/catalog/razvivashki",
    isTrigger: true,
    iconName: "lucide:brain-circuit",
  },
  {
    slug: "holyday",
    title: "Отдых",
    href: "/catalog/holyday",
    isTrigger: false,
    iconName: "lucide:brain-circuit",
  },
];
