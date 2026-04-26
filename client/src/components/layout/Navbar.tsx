import { Link, useLocation } from "wouter";
import {
  ShoppingBag,
  User,
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  Globe,
  Heart,
  Search,
  Home,
  Shirt,
  BadgePercent,
  MapPin,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/store/use-cart";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { useWishlist } from "@/hooks/use-wishlist";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import { useProducts } from "@/hooks/use-products";
import { COLOR_FAMILIES, normalizeArabic } from "@/lib/colorFamilies";
import { useToast } from "@/hooks/use-toast";

function LucerneLogo({ className }: { className?: string }) {
  return (
    <svg
      version="1.0"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 393 297"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
    >
      <g
        transform="translate(0,297) scale(0.1,-0.1)"
        fill="currentColor"
        stroke="none"
      >
        <path
          d="M2685 2594 c-179 -27 -296 -59 -490 -136 -259 -103 -609 -284 -965
-501 -126 -77 -160 -104 -160 -124 0 -26 34 -12 158 65 434 269 823 464 1138
571 167 57 252 73 379 75 100 1 115 -1 160 -25 105 -53 147 -157 126 -310 -15
-115 -53 -252 -108 -389 -114 -287 -230 -468 -408 -638 -133 -127 -246 -199
-407 -257 -76 -27 -77 -27 -101 -9 -113 89 -164 123 -242 160 -128 61 -190 76
-342 81 -115 5 -141 3 -201 -16 -114 -34 -167 -103 -125 -159 11 -15 37 -37
59 -49 52 -30 240 -89 334 -105 102 -17 356 -17 449 1 l74 15 49 -55 c67 -75
133 -175 176 -267 33 -70 37 -85 37 -163 0 -78 -2 -89 -27 -122 -16 -20 -53
-48 -85 -64 -55 -27 -64 -28 -198 -28 -145 0 -184 8 -345 66 -194 71 -407 241
-518 414 -151 234 -171 410 -152 1340 4 223 3 256 -13 301 -37 107 -122 196
-225 235 -71 26 -176 37 -187 19 -12 -19 23 -40 64 -40 69 0 161 -41 217 -96
57 -57 104 -160 104 -227 0 -39 -17 -49 -39 -24 -6 8 -35 19 -64 26 -103 23
-199 -28 -248 -133 -59 -124 -18 -252 87 -274 60 -13 151 6 196 40 18 14 37
26 42 27 6 0 10 -131 11 -337 2 -555 40 -725 211 -949 208 -272 589 -458 899
-440 163 10 250 52 298 146 64 128 4 322 -165 534 -32 39 -58 75 -58 80 0 4
10 12 23 17 12 5 56 23 99 40 222 90 465 318 620 583 130 221 234 512 257 716
20 186 -46 322 -179 366 -48 16 -166 26 -215 19z m-1854 -495 c30 -12 55 -50
64 -99 9 -50 -36 -135 -92 -174 -34 -23 -53 -29 -102 -30 -53 -1 -64 2 -87 26
-38 37 -44 107 -14 175 45 104 128 141 231 102z m759 -1010 c92 -23 220 -84
294 -139 100 -73 76 -85 -169 -85 -189 1 -281 15 -424 66 -113 39 -145 59
-149 91 -5 38 38 61 173 92 38 9 200 -6 275 -25z"
        />
      </g>
    </svg>
  );
}

type AnimationType = "pop" | "spin" | "wiggle" | "bounce" | "flip" | "rubber";

const keyframes: Record<AnimationType, string> = {
  pop: "icon-pop 0.35s ease forwards",
  spin: "icon-spin 0.45s ease-in-out forwards",
  wiggle: "icon-wiggle 0.5s ease forwards",
  bounce: "icon-bounce 0.4s ease forwards",
  flip: "icon-flip 0.45s ease forwards",
  rubber: "icon-rubber 0.5s ease forwards",
};

function DressIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 82.07 122.88"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M53.9,19.43c-0.29-0.02-0.56-0.09-0.8-0.21c-0.39-0.08-0.8-0.13-1.22-0.14c-2.72-0.11-5.97,1.14-8.99,4.4
        c-0.07,0.08-0.15,0.15-0.23,0.22c-0.89,0.75-2.22,0.63-2.97-0.26c-2.59-3.1-5.59-4.32-8.24-4.26c-1.29,0.03-2.5,0.36-3.54,0.93
        c-1,0.55-1.83,1.31-2.38,2.21c-0.83,1.37-1.04,3.11-0.28,4.98l1.45,3.57l2.64,6.49c4.26,8.43,1.34,11.18-3.23,15.5
        c-0.86,0.81-1.8,1.7-2.74,2.7c-2.8,3-5.14,5.74-7.23,8.82c-2.1,3.1-3.99,6.59-5.91,11.13c-1.99,4.72-3.48,9.05-4.46,13.46
        c-0.98,4.37-1.46,8.85-1.46,13.9c0,0.63-0.03,1.53-0.06,2.38c-0.11,3.35-0.19,5.63,3.79,7c1.03,0.36,2.12,0.48,3.24,0.45
        c1.16-0.04,2.38-0.25,3.62-0.57c0.72-0.21,1.53-0.03,2.09,0.53c2.46,2.49,4.9,3.86,7.31,4.21c2.35,0.34,4.77-0.27,7.25-1.74
        c0.76-0.49,1.79-0.45,2.51,0.17c2.49,2.13,4.88,3.27,7.17,3.36c2.22,0.08,4.48-0.85,6.77-2.85c0.62-0.57,1.55-0.74,2.35-0.34
        c3.14,1.53,5.87,2.03,8.24,1.56c2.28-0.45,4.3-1.84,6.09-4.09c0.58-0.82,1.69-1.13,2.63-0.68c2.02,0.98,3.76,1.4,5.22,1.2
        c1.3-0.18,2.44-0.9,3.41-2.21c2.21-2.99,1.97-8.54,1.76-13.25c-0.06-1.41-0.12-2.76-0.12-3.79C76.77,85.1,74,77.39,69.97,70.59
        c-4.08-6.87-9.47-12.84-15.48-18.37l-0.02-0.02c-0.94-0.84-1.68-1.71-2.25-2.61c-0.59-0.93-1-1.87-1.26-2.83
        c-0.37-1.41-0.41-2.81-0.2-4.21c0.19-1.31,0.58-2.61,1.09-3.89c0.02-0.04,0.03-0.08,0.05-0.12l3.64-8.03l1.7-3.74
        c0.79-1.74,0.71-3.37,0.03-4.65c-0.45-0.85-1.16-1.57-2.05-2.09C54.81,19.78,54.37,19.58,53.9,19.43L53.9,19.43z
        M51.91,14.87V2.11c0-1.17,0.95-2.11,2.11-2.11c1.17,0,2.11,0.95,2.11,2.11v13.67c0.42,0.18,0.82,0.38,1.2,0.61
        c1.57,0.92,2.83,2.21,3.65,3.75c1.26,2.38,1.45,5.31,0.08,8.34l-1.7,3.74l-3.62,7.99c-0.39,1-0.69,1.98-0.82,2.92
        c-0.13,0.88-0.11,1.73,0.1,2.55c0.14,0.54,0.38,1.08,0.73,1.63c0.37,0.58,0.87,1.16,1.53,1.75c0.02,0.02,0.04,0.04,0.06,0.06
        c6.28,5.78,11.93,12.05,16.25,19.32c4.36,7.34,7.34,15.69,8.22,25.58c0.01,0.06,0.01,0.12,0.01,0.18h0.01
        c0,1.24,0.05,2.4,0.1,3.62c0.24,5.39,0.51,11.75-2.59,15.94c-1.68,2.28-3.77,3.54-6.23,3.88c-1.88,0.26-3.92-0.06-6.11-0.92
        c-2.2,2.38-4.73,3.89-7.59,4.46c-2.93,0.58-6.14,0.16-9.65-1.33c-2.81,2.16-5.7,3.15-8.67,3.04
        c-2.9-0.11-5.77-1.27-8.62-3.44c-2.92,1.48-5.85,2.05-8.78,1.62c-3.02-0.44-5.97-1.94-8.83-4.58
        c-1.15,0.25-2.3,0.41-3.45,0.45c-1.6,0.05-3.18-0.14-4.74-0.68c-6.93-2.39-6.81-5.92-6.63-11.11
        c0.02-0.61,0.04-1.25,0.04-2.24c0-5.32,0.52-10.1,1.58-14.81c1.04-4.68,2.61-9.24,4.69-14.18
        c2.03-4.8,4.05-8.53,6.3-11.86c2.26-3.34,4.71-6.22,7.63-9.33c1.03-1.1,2.02-2.04,2.94-2.9c3.18-3,5.21-4.91,2.32-10.59
        c-0.04-0.07-0.07-0.15-0.1-0.22l-2.65-6.52l-1.45-3.57c-1.31-3.22-0.91-6.3,0.59-8.76c0.94-1.54,2.3-2.82,3.94-3.72
        c0.43-0.24,0.88-0.44,1.34-0.63V2.11c0-1.17,0.95-2.11,2.11-2.11c1.17,0,2.11,0.95,2.11,2.11v12.86
        c3.24-0.05,6.78,1.15,9.91,4.11C44.87,15.99,48.61,14.77,51.91,14.87L51.91,14.87z"
      />
    </svg>
  );
}

function HeelIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="-86 -2 488 420"
      fill="currentColor"
      style={{ transform: "scaleX(-1)" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 0 C5.18516255 4.06880578 7.55532171 9.48233333 10.38671875 15.3203125 C10.88863235 16.33358612 11.39054596 17.34685974 11.90766907 18.39083862 C13.51048762 21.63095395 15.09952707 24.87758691 16.6875 28.125 C18.77084462 32.35869645 20.85954435 36.58973734 22.94921875 40.8203125 C23.46276917 41.8619606 23.97631958 42.9036087 24.50543213 43.9768219 C28.41729095 51.88782799 32.48203741 59.70720648 36.62133789 67.50097656 C39.02837825 72.03707338 41.37664884 76.60190061 43.7109375 81.17578125 C44.28344742 82.29694839 44.28344742 82.29694839 44.86752319 83.44076538 C45.64113434 84.95622058 46.41459132 86.47175449 47.18789673 87.98736572 C53.21668101 99.79571747 59.29521983 111.5605693 65.71655273 123.16162109 C69.59315465 130.18504803 73.27317832 137.30139982 76.9375 144.4375 C81.7418504 153.77772433 86.73866497 162.96988611 91.96240234 172.08129883 C96.49100564 180.01283964 100.79068327 188.05360297 105.0625 196.125 C110.98799565 207.30850962 117.08400471 218.37076164 123.44433594 229.31396484 C125.13329386 232.23014738 126.80587315 235.15534642 128.4765625 238.08203125 C151.37592612 278.25781105 151.37592612 278.25781105 178 316 C178.51820313 316.69609375 179.03640625 317.3921875 179.5703125 318.109375 C183.95453441 323.71542925 189.94301066 327.64924813 197 329 C202.7019726 329.53909559 207.16860375 329.36097131 212 326 C218.29266003 320.08259034 221.63888277 313.17072672 225.125 305.375 C231.81767155 290.536984 231.81767155 290.536984 236 287 C242.75198919 286.26063117 246.95405719 287.95162885 252.84375 291.1015625 C253.67789429 291.52989883 254.51203857 291.95823517 255.37145996 292.39955139 C257.15903583 293.31832977 258.94317741 294.24381552 260.72412109 295.17538452 C265.43165292 297.633745 270.16894289 300.03324418 274.90625 302.43359375 C275.8535498 302.91449966 276.80084961 303.39540558 277.77685547 303.8908844 C310.60396241 320.47426134 345.59494398 334.52286382 381.34570312 343.27856445 C388.85840855 345.21606125 393.51833318 348.8999535 398 355 C401.15390211 361.50630155 401.03351894 369.00443711 399.2421875 375.9296875 C397.50763589 380.53239533 395.82225469 383.80089587 392 387 C388.88623047 387.95385742 388.88623047 387.95385742 385.1171875 388.60546875 C384.41619431 388.73061859 383.71520111 388.85576843 382.9929657 388.98471069 C380.62288775 389.40240351 378.24944728 389.79546004 375.875 390.1875 C374.15864797 390.48161302 372.44242442 390.77647667 370.72631836 391.07202148 C364.82252513 392.0789217 358.91174826 393.04109449 353 394 C351.90202087 394.1791394 350.80404175 394.35827881 349.67279053 394.54284668 C296.55407337 403.20217836 242.90443069 411.75652986 189 413 C188.28295898 413.02191406 187.56591797 413.04382813 186.82714844 413.06640625 C161.89180799 413.81185738 140.62074424 410.26710033 121 394 C119.96875 393.195625 118.9375 392.39125 117.875 391.5625 C92.08395011 368.5748251 75.79004487 333.77600466 63.75390625 302.1171875 C54.61629359 278.25131121 42.68295057 255.94206025 28 235 C27.54786133 234.35482422 27.09572266 233.70964844 26.62988281 233.04492188 C19.96519283 223.67161442 11.46983629 211.89396726 -0.5 209.5 C-5.46114236 210.49222847 -7.9775053 213.54220822 -10.76171875 217.51171875 C-23.96672093 238.96626677 -27.21828498 265.62325447 -27.25 290.375 C-27.25350464 291.63373932 -27.25350464 291.63373932 -27.25708008 292.91790771 C-27.2806312 316.20835997 -26.1190189 339.4782849 -25.06738281 362.73974609 C-23.85155849 389.73259087 -23.85155849 389.73259087 -23.65625 402.4921875 C-23.62841431 403.41814728 -23.60057861 404.34410706 -23.57189941 405.29812622 C-23.54903175 409.10655213 -23.55514953 411.3039258 -25.63671875 414.56103516 C-28.65267433 416.39740315 -30.63225144 416.51659285 -34.15625 416.53125 C-35.34347656 416.53640625 -36.53070313 416.5415625 -37.75390625 416.546875 C-38.99011719 416.53140625 -40.22632813 416.5159375 -41.5 416.5 C-42.73621094 416.51546875 -43.97242188 416.5309375 -45.24609375 416.546875 C-46.43332031 416.54171875 -47.62054688 416.5365625 -48.84375 416.53125 C-49.92849609 416.52673828 -51.01324219 416.52222656 -52.13085938 416.51757812 C-55.6455535 415.88354549 -56.7958895 414.74808189 -59 412 C-60.11411925 409.77176151 -60.16811179 408.47605593 -60.25192261 406.00257874 C-60.28261841 405.16480392 -60.31331421 404.32702911 -60.34494019 403.46386719 C-60.37403473 402.54130127 -60.40312927 401.61873535 -60.43310547 400.66821289 C-60.4674469 399.69645615 -60.50178833 398.7246994 -60.53717041 397.72349548 C-60.61174109 395.59780313 -60.68419103 393.47203561 -60.75481796 391.34620857 C-60.86876937 387.92516555 -60.98878288 384.50438213 -61.11038208 381.08360291 C-61.45515099 371.34939702 -61.78808877 361.61479112 -62.11962891 351.88012695 C-63.00261711 326.04421264 -63.98735078 300.22507491 -65.51171875 274.41796875 C-65.57160351 273.39608019 -65.63148827 272.37419163 -65.69318771 271.32133675 C-68.13973245 228.752915 -68.13973245 228.752915 -74.48681641 186.64111328 C-75.48439986 181.50702299 -76.32696406 176.34598743 -77.1875 171.1875 C-77.35443359 170.21393555 -77.52136719 169.24037109 -77.69335938 168.23730469 C-83.72789461 132.39017871 -85.57969234 82.86498888 -63.88964844 51.38867188 C-56.61800596 41.25884547 -48.55769953 32.01351338 -39 24 C-38.07703125 23.18917969 -37.1540625 22.37835938 -36.203125 21.54296875 C-10.3387382 -1.0513971 -10.3387382 -1.0513971 0 0 Z M-11.34375 23.52734375 C-12.00826172 24.06786377 -12.67277344 24.60838379 -13.35742188 25.1652832 C-14.06447266 25.75011475 -14.77152344 26.33494629 -15.5 26.9375 C-16.22251953 27.53071045 -16.94503906 28.1239209 -17.68945312 28.73510742 C-23.26801402 33.33966355 -28.72445073 38.04939398 -34 43 C-34.6703125 43.60585937 -35.340625 44.21171875 -36.03125 44.8359375 C-57.09538215 64.64625226 -62.77809977 92.0216178 -64 120 C-64.067385 124.33510166 -64.0648098 128.66494438 -64 133 C-63.30777344 133.268125 -62.61554687 133.53625 -61.90234375 133.8125 C-28.57254045 147.16198643 -1.32534778 171.65581528 20.90625 199.4453125 C22.94047703 201.92737309 25.06585219 204.27466703 27.25 206.625 C38.98072341 219.60020015 48.41084284 233.80487318 57 249 C57.51481934 249.91007813 58.02963867 250.82015625 58.56005859 251.7578125 C66.95840231 266.69744902 74.72595001 281.64606888 80.625 297.75 C92.87941501 330.95370338 112.08205803 372.7478256 145 390 C145.7734375 390.40734375 146.546875 390.8146875 147.34375 391.234375 C204.69823981 417.61744031 314.19239526 383.88624557 372.85546875 373.34765625 C373.54330948 373.22511475 374.23115021 373.10257324 374.93983459 372.97631836 C377.71752725 372.47001693 380.31591922 371.89469359 383 371 C383.0825 369.741875 383.165 368.48375 383.25 367.1875 C383.29640625 366.47980469 383.3428125 365.77210938 383.390625 365.04296875 C383.18590844 362.85573092 383.18590844 362.85573092 381.29174805 361.46435547 C378.81217962 359.87998864 376.79491048 359.21802237 373.94140625 358.52734375 C372.93118408 358.2732373 371.92096191 358.01913086 370.88012695 357.75732422 C369.78531006 357.48678223 368.69049316 357.21624023 367.5625 356.9375 C330.99365537 347.44009618 296.92195595 332.13188693 262.97871399 315.85197449 C256.68223041 312.83600858 250.3493016 309.90326603 244 307 C243.73372803 307.52319824 243.46745605 308.04639648 243.19311523 308.58544922 C227.3323634 339.61067715 227.3323634 339.61067715 211.8359375 345.30859375 C202.77817047 347.51689232 193.55718137 346.50194881 185 343 C184.15695312 342.6596875 183.31390625 342.319375 182.4453125 341.96875 C157.30056534 330.65743517 141.26818901 293.54435023 128 271 C127.187931 269.62995277 126.3754483 268.26015065 125.5625 266.890625 C123.02343063 262.60434579 120.50882896 258.30403547 118 254 C117.46036621 253.07541992 116.92073242 252.15083984 116.36474609 251.19824219 C103.12223522 228.47684273 90.42629247 205.47282543 77.9987793 182.29663086 C75.38620563 177.42465446 72.76609089 172.55824953 70.09375 167.71875 C63.43758825 155.65874559 57.09073221 143.45891874 50.82162476 131.19476318 C45.73408696 121.24533544 40.53840128 111.37595661 35.12939453 101.59643555 C31.22154702 94.49615624 27.5831203 87.27821683 23.99121094 80.01391602 C21.18129372 74.33717824 18.2929135 68.7138952 15.3125 63.125 C7.91667673 49.23468084 1.00308399 35.09099849 -6 21 C-8.63191962 21 -9.32069952 21.87363667 -11.34375 23.52734375 Z M-62 152 C-61.54255752 161.74976685 -60.17584604 170.88451497 -58.1875 180.4375 C-54.46626297 199.1610479 -52.56060465 217.9887921 -51 237 C-50.89782166 238.24314972 -50.89782166 238.24314972 -50.7935791 239.51141357 C-48.69301132 265.40935299 -47.50312345 291.35760548 -46.375 317.3125 C-46.34346203 318.03657295 -46.31192406 318.7606459 -46.27943039 319.50666046 C-45.51345597 337.13903744 -44.84351564 354.77185456 -44.33493042 372.41365051 C-44.06545341 381.62325804 -43.65055587 390.80916809 -43 400 C-42.34 400 -41.68 400 -41 400 C-41.11833828 395.02065211 -41.24461702 390.04154425 -41.375 385.0625 C-41.3954538 384.27514465 -41.41590759 383.48778931 -41.4369812 382.67657471 C-41.70597172 372.50515683 -42.05247932 362.34046616 -42.51171875 352.17578125 C-46.01536444 274.48102444 -46.01536444 274.48102444 -41 251 C-40.82307617 250.14905762 -40.64615234 249.29811523 -40.46386719 248.42138672 C-36.21889156 228.57117686 -29.97163099 208.64493153 -13 196 C-11.34748096 194.97679005 -9.68410202 193.9703495 -8 193 C-22.28644024 175.74966128 -40.29362873 162.47824355 -60 152 C-60.66 152 -61.32 152 -62 152 Z " />
    </svg>
  );
}
function ClickIcon({
  children,
  animation = "pop",
  className = "",
  onClick,
  tag: Tag = "button",
  testId,
}: {
  children: React.ReactNode;
  animation?: AnimationType;
  className?: string;
  onClick?: () => void;
  tag?: "button" | "span" | "div";
  testId?: string;
}) {
  const [anim, setAnim] = useState<string>("none");

  const handleClick = () => {
    setAnim("none");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnim(keyframes[animation]));
    });
    onClick?.();
  };

  return (
    <Tag
      className={className}
      onClick={handleClick}
      data-testid={testId}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <span
        style={{ display: "inline-flex", animation: anim }}
        onAnimationEnd={() => setAnim("none")}
      >
        {children}
      </span>
    </Tag>
  );
}

function HighlightMatch({ text, query }: { text?: string; query: string }) {
  if (!text || !query.trim()) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.trim().toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-bold text-foreground">
        {text.slice(idx, idx + q.length)}
      </span>
      {text.slice(idx + q.length)}
    </>
  );
}

const QUICK_CATS = [
  { href: "/dresses", labelEn: "Dresses", labelAr: "فساتين", icon: "👗" },
  { href: "/clothes", labelEn: "Clothes", labelAr: "ملابس", icon: "👚" },
  { href: "/shoes", labelEn: "Shoes", labelAr: "شوزات", icon: "👠" },
  { href: "/sales", labelEn: "Sales", labelAr: "تخفيضات", icon: "🏷️" },
];

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("lucerne_search_history") || "[]");
    } catch {
      return [];
    }
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [location, navigate] = useLocation();
  const { items: cartItems } = useCart();
  const { data: user } = useAuth();
  const logout = useLogout();
  const { t, language, setLanguage } = useLanguage();
  const { wishlistItems } = useWishlist();
  const wishlistCount = wishlistItems.length;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const shownNotifIds = useRef<Set<number>>(new Set());
  const initialNotifLoad = useRef(false);
  const { data: notificationsData = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    refetchInterval: 10000,
  });
  const markAllRead = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/read-all"),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });
  // Request browser notification permission once logged in
  useEffect(() => {
    if (!user) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [!!user]);
  // Fire in-app toasts + native browser notifications for new unread updates
  useEffect(() => {
    if (!user || notificationsData.length === 0) return;
    if (!initialNotifLoad.current) {
      // On first load: silently absorb already-READ notifications so they don't
      // re-toast, but leave UNREAD ones so offline customers see them on return.
      notificationsData.forEach((n: any) => {
        if (n.isRead) shownNotifIds.current.add(n.id);
      });
      initialNotifLoad.current = true;
    }
    const newUnread = notificationsData.filter(
      (n: any) => !n.isRead && !shownNotifIds.current.has(n.id),
    );
    if (newUnread.length === 0) return;
    newUnread.forEach((n: any) => {
      shownNotifIds.current.add(n.id);
      const body = language === "ar" ? n.messageAr : n.message;
      const link = n.link || "/profile";
      const isExchange = n.type?.startsWith("exchange_");
      const isApproved = n.type === "exchange_approved";
      // In-app toast (always shown)
      const isDenied = n.type === "exchange_denied";
      toast({
        title:
          language === "ar"
            ? isApproved
              ? "تمت الموافقة على الاستبدال ✓"
              : isDenied
                ? "تم رفض طلب الاستبدال"
                : "تحديث طلبك"
            : isApproved
              ? "Exchange Approved ✓"
              : isDenied
                ? "Exchange Request Declined"
                : "Order Update",
        description: body,
        icon: isExchange ? "exchange" : "success",
        onClick: () => navigate(link),
      } as any);
      // Native browser notification (if permission granted)
      if ("Notification" in window && Notification.permission === "granted") {
        const notif = new window.Notification("Lucerne Boutique 🛍", {
          body,
          icon: "/favicon.ico",
        });
        notif.onclick = () => {
          window.focus();
          navigate(link);
          notif.close();
        };
      }
    });
    markAllRead.mutate();
  }, [notificationsData]);
  const { data: siteSettings } = useSiteSettings();
  const newsBarEnabled =
    getSetting(siteSettings, "news_bar_enabled") === "true";
  const newsBarTextAr = getSetting(siteSettings, "news_bar_text_ar");
  const newsBarTextEn = getSetting(siteSettings, "news_bar_text_en");
  const newsBarText = language === "ar" ? newsBarTextAr : newsBarTextEn;
  const showNewsBar = newsBarEnabled && newsBarText.trim().length > 0;
  const isAr = language === "ar";

  const { data: allProducts } = useProducts();

  const productMatchesColor = (p: any, q: string): boolean => {
    const lower = q.toLowerCase();
    const normQ = normalizeArabic(q);
    const colorVariants: any[] = p.colorVariants || [];
    if (colorVariants.length > 0) {
      for (const v of colorVariants) {
        // Match variant name in both English (case-insensitive) and Arabic (normalized)
        if (v.name?.toLowerCase().includes(lower)) return true;
        if (normalizeArabic(v.name || "").includes(normQ)) return true;
        for (const tag of v.colorTags || []) {
          const fam = COLOR_FAMILIES.find((f) => f.key === tag);
          if (fam) {
            if (fam.nameEn.toLowerCase().includes(lower)) return true;
            if (normalizeArabic(fam.nameAr).includes(normQ)) return true;
            for (const m of fam.members) {
              if (m.nameEn.toLowerCase().includes(lower)) return true;
              if (normalizeArabic(m.nameAr).includes(normQ)) return true;
            }
          }
        }
      }
    } else {
      for (const c of p.colors || []) {
        if (c.toLowerCase().includes(lower)) return true;
        if (normalizeArabic(c).includes(normQ)) return true;
      }
    }
    // Also match by family name even without colorTags, using variant name lookup
    for (const fam of COLOR_FAMILIES) {
      const famMatches =
        fam.nameEn.toLowerCase().includes(lower) ||
        normalizeArabic(fam.nameAr).includes(normQ) ||
        fam.members.some(
          (m) =>
            m.nameEn.toLowerCase().includes(lower) ||
            normalizeArabic(m.nameAr).includes(normQ),
        );
      if (famMatches) {
        if (colorVariants.some((v) => (v.colorTags || []).includes(fam.key)))
          return true;
        // fallback: check raw variant name against all family member names
        if (
          colorVariants.some((v) =>
            fam.members.some(
              (m) =>
                normalizeArabic(v.name || "") === normalizeArabic(m.nameAr) ||
                v.name?.toLowerCase() === m.nameEn.toLowerCase(),
            ),
          )
        )
          return true;
      }
    }
    return false;
  };

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (q.length < 1) return [];
    const lower = q.toLowerCase();
    const normQ = normalizeArabic(q);

    // Price search: supports "50", "<50", "<=50", ">20", ">=20", "20-50", "20 to 50", "₪50", "50nis"
    const priceQ = q.replace(/[₪$,]|nis|شيكل/gi, "").trim();
    let priceFilter: ((price: number) => boolean) | null = null;
    const rangeMatch = priceQ.match(
      /^(\d+(?:\.\d+)?)\s*(?:-|to|إلى|الى)\s*(\d+(?:\.\d+)?)$/i,
    );
    const cmpMatch = priceQ.match(/^(<=|>=|<|>)\s*(\d+(?:\.\d+)?)$/);
    const exactMatch = priceQ.match(/^(\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const lo = parseFloat(rangeMatch[1]);
      const hi = parseFloat(rangeMatch[2]);
      const [min, max] = lo <= hi ? [lo, hi] : [hi, lo];
      priceFilter = (price) => price >= min && price <= max;
    } else if (cmpMatch) {
      const op = cmpMatch[1];
      const val = parseFloat(cmpMatch[2]);
      priceFilter = (price) =>
        op === "<"
          ? price < val
          : op === "<="
            ? price <= val
            : op === ">"
              ? price > val
              : price >= val;
    } else if (exactMatch) {
      const val = parseFloat(exactMatch[1]);
      // Tolerance scales with the searched amount: ±20% but at least ±25 NIS,
      // so a search for "100" finds ~75–125 and "300" finds ~240–360.
      const tolerance = Math.max(25, val * 0.2);
      priceFilter = (price) =>
        price >= val - tolerance && price <= val + tolerance;
    }

    const getEffectivePrice = (p: any) =>
      Number(p.discountPrice || p.price || 0);

    const matched = (allProducts || []).filter((p: any) => {
      if (priceFilter && priceFilter(getEffectivePrice(p))) return true;
      return (
        p.name?.toLowerCase().includes(lower) ||
        normalizeArabic(p.nameAr || "").includes(normQ) ||
        p.description?.toLowerCase().includes(lower) ||
        normalizeArabic(p.description || "").includes(normQ) ||
        p.brand?.toLowerCase().includes(lower) ||
        productMatchesColor(p, q)
      );
    });
    matched.sort((a: any, b: any) => {
      const aExact =
        a.name?.toLowerCase().startsWith(lower) ||
        normalizeArabic(a.nameAr || "").startsWith(normQ);
      const bExact =
        b.name?.toLowerCase().startsWith(lower) ||
        normalizeArabic(b.nameAr || "").startsWith(normQ);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return 0;
    });
    return matched.slice(0, 18);
  }, [searchQuery, allProducts]);

  const resolveColorCode = (variant: any): string => {
    if (variant.colorCode) return variant.colorCode;
    const name = (variant.name || "").trim();
    const lower = name.toLowerCase();
    for (const family of COLOR_FAMILIES) {
      for (const member of family.members) {
        if (member.nameEn.toLowerCase() === lower || member.nameAr === name)
          return member.hex;
      }
      if (family.nameEn.toLowerCase() === lower || family.nameAr === name)
        return family.members[0]?.hex || "#9ca3af";
    }
    return "#9ca3af";
  };

  const saveToHistory = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const updated = [
      trimmed,
      ...searchHistory.filter((h) => h !== trimmed),
    ].slice(0, 8);
    setSearchHistory(updated);
    localStorage.setItem("lucerne_search_history", JSON.stringify(updated));
  };

  const deleteHistoryItem = (item: string) => {
    const updated = searchHistory.filter((h) => h !== item);
    setSearchHistory(updated);
    localStorage.setItem("lucerne_search_history", JSON.stringify(updated));
  };

  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem("lucerne_search_history");
  };

  const handleSelectProduct = (productId: number) => {
    saveToHistory(searchQuery);
    navigate(`/product/${productId}`);
    setSearchOpen(false);
  };

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 80);
    } else {
      setSearchQuery("");
    }
  }, [searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const newsBarRef = useRef<HTMLDivElement>(null);

  const updateNewsBarOffset = useCallback(() => {
    const h =
      showNewsBar && newsBarRef.current ? newsBarRef.current.offsetHeight : 0;
    document.documentElement.style.setProperty("--news-bar-offset", `${h}px`);
  }, [showNewsBar]);

  useEffect(() => {
    updateNewsBarOffset();
    window.addEventListener("resize", updateNewsBarOffset);
    return () => window.removeEventListener("resize", updateNewsBarOffset);
  }, [updateNewsBarOffset]);

  const itemCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const toggleLanguage = () => {
    setLanguage(language === "ar" ? "en" : "ar");
  };

  return (
    <>
      {/* Inject keyframe styles once */}
      <style>{`
        @keyframes icon-pop    { 0%{transform:scale(1)} 35%{transform:scale(1.35)} 65%{transform:scale(0.9)} 82%{transform:scale(1.1)} 100%{transform:scale(1)} }
        @keyframes icon-spin   { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes icon-wiggle { 0%{transform:rotate(0)} 15%{transform:rotate(-18deg)} 30%{transform:rotate(16deg)} 45%{transform:rotate(-12deg)} 60%{transform:rotate(10deg)} 75%{transform:rotate(-6deg)} 90%{transform:rotate(4deg)} 100%{transform:rotate(0)} }
        @keyframes icon-bounce { 0%{transform:translateY(0)} 30%{transform:translateY(-10px)} 60%{transform:translateY(0)} 80%{transform:translateY(-5px)} 100%{transform:translateY(0)} }
        @keyframes icon-flip   { 0%{transform:rotateY(0)} 25%{transform:rotateY(90deg)} 50%{transform:rotateY(180deg)} 75%{transform:rotateY(270deg)} 100%{transform:rotateY(360deg)} }
        @keyframes icon-rubber { 0%{transform:scale(1,1)} 20%{transform:scale(1.3,0.75)} 40%{transform:scale(0.75,1.25)} 60%{transform:scale(1.1,0.9)} 80%{transform:scale(0.95,1.05)} 100%{transform:scale(1,1)} }
      `}</style>

      {showNewsBar &&
        (() => {
          const items = newsBarText
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean);
          return (
            <div
              ref={newsBarRef}
              className="fixed top-0 w-full z-[51] overflow-hidden bg-foreground text-background"
              data-testid="news-bar"
            >
              {/* Fade edges */}
              <div
                className="pointer-events-none absolute top-0 start-0 bottom-0 w-14 z-10"
                style={{
                  background:
                    "linear-gradient(to right, hsl(var(--foreground)), transparent)",
                }}
              />
              <div
                className="pointer-events-none absolute top-0 end-0 bottom-0 w-14 z-10"
                style={{
                  background:
                    "linear-gradient(to left, hsl(var(--foreground)), transparent)",
                }}
              />

              <motion.div
                className="flex items-center gap-10 whitespace-nowrap py-2.5"
                style={{ width: "max-content" }}
                animate={{
                  x: language === "ar" ? ["0%", "50%"] : ["0%", "-50%"],
                }}
                transition={{ repeat: Infinity, duration: 28, ease: "linear" }}
              >
                {[0, 1].map((g) => (
                  <span
                    key={g}
                    className="flex items-center gap-10"
                    aria-hidden={g > 0 || undefined}
                  >
                    {Array.from({ length: 4 }).map((_, rep) =>
                      items.map((item, i) => (
                        <span
                          key={`${rep}-${i}`}
                          className="inline-flex items-center gap-10"
                        >
                          <span className="text-xs sm:text-sm font-light tracking-[0.25em] uppercase text-background/80">
                            {item}
                          </span>
                          <span className="text-background/30 text-[8px]">
                            ✦
                          </span>
                        </span>
                      )),
                    )}
                  </span>
                ))}
              </motion.div>
            </div>
          );
        })()}

      <header
        className={`fixed w-full z-50 transition-all duration-300 ${
          isScrolled || location !== "/"
            ? "bg-background/95 backdrop-blur-md border-b"
            : "bg-transparent text-white"
        }`}
        style={{ top: `var(--news-bar-offset, 0px)` }}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link
              href="/"
              className="flex flex-col items-center gap-0.5"
              data-testid="link-logo"
            >
              <LucerneLogo className="h-8 w-auto sm:h-10" />
              <span className="font-display text-[10px] sm:text-sm tracking-widest font-semibold uppercase leading-none">
                Lucerne Boutique
              </span>
            </Link>

            <nav className="hidden md:flex gap-6">
              <Link
                href="/"
                className="text-sm uppercase tracking-widest hover:opacity-70 transition-opacity"
                data-testid="link-home"
              >
                {t.nav.home}
              </Link>
              <Link
                href="/dresses"
                className="text-sm uppercase tracking-widest hover:opacity-70 transition-opacity"
                data-testid="link-dresses"
              >
                {t.nav.dresses}
              </Link>
              <Link
                href="/clothes"
                className="text-sm uppercase tracking-widest hover:opacity-70 transition-opacity"
                data-testid="link-clothes"
              >
                {t.nav.clothes}
              </Link>
              <Link
                href="/shoes"
                className="text-sm uppercase tracking-widest hover:opacity-70 transition-opacity"
                data-testid="link-shoes"
              >
                {t.nav.shoes}
              </Link>
              <Link
                href="/sales"
                className="text-sm uppercase tracking-widest hover:opacity-70 transition-opacity text-destructive"
                data-testid="link-sales"
              >
                {t.nav.sales}
              </Link>
              <Link
                href="/our-location"
                className="text-sm uppercase tracking-widest hover:opacity-70 transition-opacity"
                data-testid="link-our-location"
              >
                {t.nav.ourLocation}
              </Link>
            </nav>

            <div className="flex items-center gap-2 sm:gap-4">
              {/* Search icon */}
              <ClickIcon
                animation="pop"
                onClick={() => setSearchOpen(true)}
                className="hover:opacity-70 transition-opacity bg-transparent border-none outline-none"
                testId="button-search-open"
              >
                <Search className="w-5 h-5" />
              </ClickIcon>

              {/* Language toggle — spins like a globe */}
              <ClickIcon
                animation="spin"
                onClick={toggleLanguage}
                className="flex items-center gap-1 text-sm hover:opacity-70 transition-opacity bg-transparent border-none outline-none"
                testId="button-language-toggle"
              >
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">{t.langLabel}</span>
              </ClickIcon>

              {/* Admin/Employee dashboard — rubber stretch */}
              {(user?.role === "admin" || user?.role === "employee") && (
                <ClickIcon animation="rubber" tag="span">
                  <Link href="/admin">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hover:bg-transparent hover:opacity-70"
                      data-testid="link-admin"
                    >
                      <LayoutDashboard className="w-5 h-5" />
                    </Button>
                  </Link>
                </ClickIcon>
              )}

              {user ? (
                <div className="flex items-center gap-3 sm:gap-4">
                  {/* Wishlist — rubber pop */}
                  <ClickIcon animation="rubber" tag="span">
                    <Link
                      href="/wishlist"
                      className="relative hover:opacity-70 transition-opacity block"
                      data-testid="link-wishlist"
                    >
                      <Heart className="w-5 h-5" strokeWidth={1.5} />
                      <AnimatePresence>
                        {wishlistCount > 0 && (
                          <motion.span
                            key={wishlistCount}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 500,
                              damping: 20,
                            }}
                            className="absolute -top-2 -end-2 bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center"
                            data-testid="text-wishlist-count"
                          >
                            {wishlistCount}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </Link>
                  </ClickIcon>
                  {/* Profile — pop bounce */}
                  <ClickIcon animation="pop" tag="span">
                    <Link
                      href="/profile"
                      className="hover:opacity-70 transition-opacity block"
                      data-testid="link-profile"
                    >
                      <User className="w-5 h-5" />
                    </Link>
                  </ClickIcon>
                  {/* Logout — wiggle goodbye */}
                  <ClickIcon
                    animation="wiggle"
                    onClick={() => logout.mutate()}
                    className="hover:opacity-70 transition-opacity bg-transparent border-none outline-none"
                    testId="button-logout"
                  >
                    <LogOut className="w-5 h-5" />
                  </ClickIcon>
                </div>
              ) : (
                <ClickIcon animation="pop" tag="span">
                  <Link
                    href="/auth"
                    className="hover:opacity-70 transition-opacity block"
                    data-testid="link-auth"
                  >
                    <User className="w-5 h-5" />
                  </Link>
                </ClickIcon>
              )}

              {/* Cart — bounce like items dropping in */}
              <ClickIcon animation="bounce" tag="span">
                <Link
                  href="/cart"
                  className="relative hover:opacity-70 transition-opacity block"
                  data-testid="link-cart"
                >
                  <ShoppingBag className="w-5 h-5" />
                  <AnimatePresence>
                    {itemCount > 0 && (
                      <motion.span
                        key={itemCount}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 20,
                        }}
                        className="absolute -top-2 -end-2 bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center"
                        data-testid="text-cart-count"
                      >
                        {itemCount}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              </ClickIcon>

              {/* Mobile menu toggle — flips between menu and X */}
              <div className="md:hidden">
                <ClickIcon
                  animation="flip"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="bg-transparent border-none outline-none"
                  testId="button-mobile-menu"
                >
                  {mobileMenuOpen ? (
                    <X className="w-6 h-6" />
                  ) : (
                    <Menu className="w-6 h-6" />
                  )}
                </ClickIcon>
              </div>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden absolute top-20 inset-x-0 w-full bg-background border-b shadow-lg text-foreground">
            <div className="flex flex-col p-4">
              <Link
                href="/"
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-widest font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Home
                  className="w-5 h-5 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
                {t.nav.home}
              </Link>
              <Link
                href="/dresses"
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-widest font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <DressIcon className="w-5 h-5 shrink-0 text-muted-foreground" />
                {t.nav.dresses}
              </Link>
              <Link
                href="/clothes"
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-widest font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Shirt
                  className="w-5 h-5 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
                {t.nav.clothes}
              </Link>
              <Link
                href="/shoes"
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-widest font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <HeelIcon className="w-5 h-5 shrink-0 text-muted-foreground" />
                {t.nav.shoes}
              </Link>
              <Link
                href="/sales"
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-widest font-medium text-destructive hover:bg-destructive/5 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <BadgePercent
                  className="w-5 h-5 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
                {t.nav.sales}
              </Link>
              <Link
                href="/our-location"
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-widest font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <MapPin
                  className="w-5 h-5 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
                {t.nav.ourLocation}
              </Link>
              {user && (
                <>
                  <Link
                    href="/wishlist"
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-widest font-medium hover:bg-muted/50 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="link-wishlist-mobile"
                  >
                    <Heart
                      className="w-5 h-5 shrink-0 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    {t.wishlist.navLabel}
                  </Link>
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-widest font-medium hover:bg-muted/50 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="link-profile-mobile"
                  >
                    <User
                      className="w-5 h-5 shrink-0 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    {t.profile.myAccount}
                  </Link>
                </>
              )}
              {(user?.role === "admin" || user?.role === "employee") && (
                <Link
                  href="/admin"
                  className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-widest font-medium text-primary hover:bg-primary/5 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <LayoutDashboard
                    className="w-5 h-5 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  {t.nav.adminDashboard}
                </Link>
              )}
              {user && (
                <div className="border-t border-border/40 mt-2 pt-2">
                  <button
                    onClick={() => {
                      logout.mutate();
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm uppercase tracking-widest font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors w-full text-start"
                    data-testid="button-logout-mobile"
                  >
                    <LogOut className="w-5 h-5 shrink-0" strokeWidth={1.5} />
                    {t.profile.logout}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Mobile menu backdrop — tap anywhere outside to close ── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[49] md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Search Overlay ── */}
      <AnimatePresence>
        {searchOpen && (
          <>
            {/* Search panel */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[200] bg-background/97 backdrop-blur-md flex flex-col"
              data-testid="search-overlay"
            >
              {/* Search input bar */}
              <div className="flex items-center gap-3 px-4 sm:px-10 py-4 border-b border-border">
                <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isAr
                      ? "ابحثي بالاسم، اللون، السعر..."
                      : "Search by name, color, brand..."
                  }
                  className="flex-1 bg-transparent text-base sm:text-lg outline-none placeholder:text-muted-foreground"
                  data-testid="input-search"
                  dir={isAr ? "rtl" : "ltr"}
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchQuery.trim())
                      saveToHistory(searchQuery);
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    aria-label="Clear"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setSearchOpen(false)}
                  className="ms-1 p-1.5 rounded-md hover:bg-muted transition-colors"
                  data-testid="button-search-close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable body — click on empty area closes search */}
              <div
                className="flex-1 overflow-y-auto"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setSearchOpen(false);
                }}
              >
                <div className="max-w-4xl mx-auto px-4 sm:px-8 py-5 space-y-6">
                  {/* Empty state */}
                  {!searchQuery.trim() && (
                    <>
                      {/* Search history */}
                      {searchHistory.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                              {isAr
                                ? "عمليات البحث الأخيرة"
                                : "Recent searches"}
                            </p>
                            <button
                              onClick={clearHistory}
                              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                            >
                              {isAr ? "مسح الكل" : "Clear all"}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {searchHistory.map((item) => (
                              <div
                                key={item}
                                className="flex items-center gap-1 pl-3 pr-1 py-1.5 rounded-full border border-border bg-muted/40 text-sm"
                              >
                                <button
                                  onClick={() => setSearchQuery(item)}
                                  className="hover:text-foreground text-muted-foreground transition-colors"
                                >
                                  {item}
                                </button>
                                <button
                                  onClick={() => deleteHistoryItem(item)}
                                  className="p-0.5 rounded-full hover:bg-border transition-colors text-muted-foreground hover:text-foreground"
                                  aria-label="Remove"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Category shortcuts */}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                          {isAr ? "تصفحي حسب القسم" : "Browse by category"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {QUICK_CATS.map((cat) => (
                            <Link
                              key={cat.href}
                              href={cat.href}
                              onClick={() => setSearchOpen(false)}
                              className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-muted/40 hover:bg-muted text-sm font-medium transition-colors"
                            >
                              <span>{cat.icon}</span>
                              <span>{isAr ? cat.labelAr : cat.labelEn}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* No results */}
                  {searchQuery.trim() && searchResults.length === 0 && (
                    <div className="text-center py-16">
                      <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground font-medium">
                        {isAr
                          ? `لا توجد نتائج لـ "${searchQuery}"`
                          : `No results for "${searchQuery}"`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isAr
                          ? "جربي كلمة أخرى أو لون أو ماركة"
                          : "Try a different keyword, color, or brand"}
                      </p>
                    </div>
                  )}

                  {/* Results grid */}
                  {searchResults.length > 0 && (
                    <>
                      <p className="text-xs text-muted-foreground -mb-2">
                        {isAr
                          ? `${searchResults.length} نتيجة`
                          : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                        {searchResults.map((p: any) => {
                          const variants: any[] = p.colorVariants || [];
                          const legacyColors: string[] = p.colors || [];
                          const swatches =
                            variants.length > 0
                              ? variants.slice(0, 4)
                              : legacyColors
                                  .slice(0, 4)
                                  .map((c: string) => ({
                                    name: c,
                                    colorCode: null,
                                  }));
                          const hasDiscount =
                            p.discountPrice &&
                            parseFloat(p.discountPrice) < parseFloat(p.price);
                          const displayName =
                            isAr && p.nameAr ? p.nameAr : p.name;
                          const discountPct = hasDiscount
                            ? Math.round(
                                (1 -
                                  parseFloat(p.discountPrice) /
                                    parseFloat(p.price)) *
                                  100,
                              )
                            : 0;
                          const totalVariants =
                            variants.length || legacyColors.length;
                          return (
                            <button
                              key={p.id}
                              onClick={() => handleSelectProduct(p.id)}
                              className="group text-start flex flex-col rounded-2xl overflow-hidden border border-border/60 bg-card hover:border-border hover:shadow-md transition-all duration-200"
                              data-testid={`search-result-${p.id}`}
                            >
                              {/* Image */}
                              <div
                                className="relative w-full bg-secondary overflow-hidden"
                                style={{ aspectRatio: "3/4" }}
                              >
                                {p.mainImage ? (
                                  <img
                                    src={p.mainImage}
                                    alt={p.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                    <ShoppingBag className="w-8 h-8" />
                                  </div>
                                )}
                                {hasDiscount && (
                                  <span className="absolute top-2 start-2 bg-destructive text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                                    -{discountPct}%
                                  </span>
                                )}
                              </div>

                              {/* Info */}
                              <div className="flex flex-col gap-1 p-2.5 flex-1">
                                <p className="text-[13px] font-medium leading-snug line-clamp-2 text-foreground">
                                  <HighlightMatch
                                    text={displayName}
                                    query={searchQuery.trim()}
                                  />
                                </p>
                                {p.brand && (
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    <HighlightMatch
                                      text={p.brand}
                                      query={searchQuery.trim()}
                                    />
                                  </p>
                                )}

                                {/* Color swatches — with proper hex resolution */}
                                {swatches.length > 0 && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {swatches.map((v: any, i: number) => {
                                      const hex = resolveColorCode(v);
                                      return (
                                        <span
                                          key={i}
                                          title={v.name}
                                          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                                          style={{
                                            backgroundColor: hex,
                                            boxShadow: `0 0 0 1.5px rgba(0,0,0,0.15), 0 0 0 2.5px white, 0 0 0 3.5px rgba(0,0,0,0.08)`,
                                          }}
                                        />
                                      );
                                    })}
                                    {totalVariants > 4 && (
                                      <span className="text-[10px] text-muted-foreground ms-1">
                                        +{totalVariants - 4}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Price */}
                                <div className="mt-auto pt-1.5">
                                  {hasDiscount ? (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-sm font-bold text-destructive">
                                        ₪
                                        {parseFloat(p.discountPrice).toFixed(0)}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground line-through">
                                        ₪{parseFloat(p.price).toFixed(0)}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-sm font-semibold">
                                      ₪{parseFloat(p.price).toFixed(0)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
