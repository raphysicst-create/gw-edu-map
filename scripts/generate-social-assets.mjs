import { writeFile } from "node:fs/promises";
import sharp from "sharp";

// A typographic personal-tool identity. No unverified map geometry or school dots.
const mark = `<rect width="64" height="64" rx="16" fill="#102d38"/><path d="M12 17h16l4 4 4-4h16v31H36l-4 4-4-4H12Z" fill="none" stroke="#72e5bd" stroke-width="3"/><path d="M32 22v25M18 26h8M18 33h8M38 26h8M38 33h8" stroke="#72e5bd" stroke-width="2"/>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${mark}</svg>`;
await writeFile("src/app/icon.svg", icon);
await sharp(Buffer.from(icon)).resize(512, 512).png().toFile("src/app/apple-icon.png");
const sizes = [16, 32, 48, 64];
const images = await Promise.all(sizes.map(size => sharp(Buffer.from(icon)).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((bytes, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(sizes[index], entry); header.writeUInt8(sizes[index], entry + 1);
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(bytes.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += bytes.length;
});
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...images]));
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#091722"/>
<path d="M70 50H1130V580H70Z" fill="none" stroke="#244650" stroke-width="2"/>
<g transform="translate(90 80)">${mark}</g>
<text x="90" y="277" fill="#e8f4f1" font-size="82" font-weight="700" font-family="Malgun Gothic, Noto Sans CJK KR, sans-serif">강원 교육지도</text>
<text x="95" y="358" fill="#a1bcc3" font-size="32" font-family="Malgun Gothic, Noto Sans CJK KR, sans-serif">학교와 지역의 교육 현황</text>
<path d="M95 405H1095" stroke="#2bb99b" stroke-width="2"/>
<text x="95" y="474" fill="#72e5bd" font-size="26" font-family="Malgun Gothic, Noto Sans CJK KR, sans-serif">개인 제작 · 업무 참고용</text>
<text x="95" y="528" fill="#93aab4" font-size="22" font-family="Malgun Gothic, Noto Sans CJK KR, sans-serif">공식 공개자료의 출처와 기준일을 함께 확인하세요</text>
</svg>`;
await writeFile("public/social-preview.svg", preview);
await sharp(Buffer.from(preview)).png({ compressionLevel: 9 }).toFile("public/social-preview.png");
