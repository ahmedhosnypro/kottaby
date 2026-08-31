"use client";

import { Stack } from "@mui/material";
import type { ReactNode } from "react";
import { FooterColumn } from "@/frontend/components/siteFooter/FooterColumn";
import { FooterLink } from "@/frontend/components/siteFooter/FooterLink";
import { Landing, useAppTranslation } from "@/shared/locale";

/** Three link columns (Product / Company / Legal) in the right 60% zone. */
export function FooterLinksSection(): ReactNode {
  const t = useAppTranslation(Landing);

  return (
    <Stack
      direction={{ xs: "row", sm: "column", md: "row" }}
      spacing={{ xs: 5, sm: 3, md: 6 }}
      sx={{
        flex: { md: "1 1 60%" },
        flexWrap: "wrap",
        justifyContent: { xs: "flex-start", sm: "flex-end", md: "space-between" },
      }}
    >
      <FooterColumn title={t.footerProduct}>
        <FooterLink href="/register">{t.footerProductFeatures}</FooterLink>
        <FooterLink href="/register">{t.footerProductRecitations}</FooterLink>
        <FooterLink href="/register">{t.footerProductPricing}</FooterLink>
      </FooterColumn>
      <FooterColumn title={t.footerCompany}>
        <FooterLink href="/register">{t.footerCompanyAbout}</FooterLink>
        <FooterLink href="/register">{t.footerCompanyCareers}</FooterLink>
        <FooterLink href="/register">{t.footerCompanyContact}</FooterLink>
      </FooterColumn>
      <FooterColumn title={t.footerLegal}>
        <FooterLink href="/register">{t.footerLegalPrivacy}</FooterLink>
        <FooterLink href="/register">{t.footerLegalTerms}</FooterLink>
        <FooterLink href="/register">{t.footerLegalCookies}</FooterLink>
      </FooterColumn>
    </Stack>
  );
}
