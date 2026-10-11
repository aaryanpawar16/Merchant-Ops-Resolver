import { shareImage, shareImageSize } from "@/lib/shareImage";

export const alt = "Merchant Ops Resolver: one instruction in, a failed settlement fixed, verified and closed";
export const size = shareImageSize;
export const contentType = "image/png";

export default function Image() {
  return shareImage();
}
