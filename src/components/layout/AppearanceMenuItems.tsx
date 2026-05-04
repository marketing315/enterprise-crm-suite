import { Sun, Moon, Monitor, Rows3, Rows4, Languages, Palette, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useUIPreferences, type Density, type UILanguage } from "@/hooks/useUIPreferences";

function CheckIcon({ active }: { active: boolean }) {
  return active ? <Check className="ml-auto h-4 w-4 opacity-80" /> : <span className="ml-auto w-4" />;
}

export function AppearanceMenuItems() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { prefs, update } = useUIPreferences();

  const setDensity = (d: Density) => update({ density: d });
  const setLanguage = (lng: UILanguage) => {
    update({ language: lng });
    void i18n.changeLanguage(lng);
  };
  const setThemePref = (val: "light" | "dark" | "system") => {
    setTheme(val);
    update({ theme: val });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette className="mr-2 h-4 w-4" />
        {t("appearance.title")}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t("appearance.theme")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setThemePref("light")}>
            <Sun className="mr-2 h-4 w-4" />
            {t("appearance.theme_light")}
            <CheckIcon active={theme === "light"} />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setThemePref("dark")}>
            <Moon className="mr-2 h-4 w-4" />
            {t("appearance.theme_dark")}
            <CheckIcon active={theme === "dark"} />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setThemePref("system")}>
            <Monitor className="mr-2 h-4 w-4" />
            {t("appearance.theme_system")}
            <CheckIcon active={theme === "system" || !theme} />
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t("appearance.density")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setDensity("comfortable")}>
            <Rows3 className="mr-2 h-4 w-4" />
            {t("appearance.density_comfortable")}
            <CheckIcon active={prefs.density === "comfortable"} />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDensity("compact")}>
            <Rows4 className="mr-2 h-4 w-4" />
            {t("appearance.density_compact")}
            <CheckIcon active={prefs.density === "compact"} />
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t("appearance.language")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setLanguage("it")}>
            <Languages className="mr-2 h-4 w-4" />
            {t("appearance.language_it")}
            <CheckIcon active={prefs.language === "it"} />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLanguage("en")}>
            <Languages className="mr-2 h-4 w-4" />
            {t("appearance.language_en")}
            <CheckIcon active={prefs.language === "en"} />
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
