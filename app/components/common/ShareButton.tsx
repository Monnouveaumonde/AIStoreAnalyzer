import { Button, Toast, Frame } from "@shopify/polaris";
import { useState, useCallback } from "react";

interface ShareButtonProps {
  shareSlug: string | null;
  appUrl?: string;
}

export function ShareButton({ shareSlug, appUrl = "" }: ShareButtonProps) {
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const handleShare = useCallback(async () => {
    if (!shareSlug) return;

    const url = `${appUrl}/report/${shareSlug}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Mon Store Score — AI Store Analyzer",
          text: "Découvrez le score de ma boutique Shopify et les opportunités de revenus !",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setToastMessage("Lien copié dans le presse-papier !");
        setToastActive(true);
      }
    } catch {
      await navigator.clipboard.writeText(url);
      setToastMessage("Lien copié dans le presse-papier !");
      setToastActive(true);
    }
  }, [shareSlug, appUrl]);

  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} onDismiss={() => setToastActive(false)} />
  ) : null;

  return (
    <Frame>
      <>
        <Button onClick={handleShare} disabled={!shareSlug}>
          Partager mon score
        </Button>
        {toastMarkup}
      </>
    </Frame>
  );
}
