import type { Language } from '../brand';

/**
 * Flat translation dictionaries. Keys are dotted strings; `en` defines the typed key set —
 * every other language must provide the same keys (enforced by `Record<I18nKey, string>`).
 */
export const en = {
  // ── Common ────────────────────────────────────────────────────────────────
  'common.signin': 'Sign in',
  'common.signup': 'Get started',
  'common.signupFree': 'Start for free',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.loading': 'Loading…',
  'common.comingSoon': 'Coming soon',
  'common.phasePlanned': 'Planned',
  'common.language': 'Language',
  'common.theme': 'Theme',
  'common.themeLight': 'Light',
  'common.themeDark': 'Dark',
  'common.themeSystem': 'System',

  // ── Navigation ────────────────────────────────────────────────────────────
  'nav.product': 'Product',
  'nav.features': 'Features',
  'nav.plans': 'Plans',
  'nav.teams': 'Teams',
  'nav.trust': 'Trust Center',
  'nav.status': 'Status',
  'nav.docs': 'Docs',
  'nav.workspace': 'Workspace',
  'nav.account': 'Account',
  'nav.admin': 'Admin',

  // ── Hero / home ───────────────────────────────────────────────────────────
  'hero.badge': 'Free-first AI workspace',
  'hero.title1': 'Think, learn, and build',
  'hero.title2': 'with your AI workspace.',
  'hero.subtitle':
    'ConAI brings AI assistance, study tools, documents, and team collaboration into one calm, beautiful workspace — free to start, no credit card.',
  'hero.ctaPrimary': 'Start for free',
  'hero.ctaSecondary': 'See how it works',
  'hero.note': 'Personal plan free forever · 500 Sparks per day',

  // ── Features ──────────────────────────────────────────────────────────────
  'features.title': 'Everything you need, nothing you don’t',
  'features.subtitle':
    'Five product areas built as one coherent platform — designed with Linear’s precision and Notion’s calm.',
  'features.chat.title': 'AI Chat',
  'features.chat.body':
    'Streaming conversations with markdown, code, and LaTeX. Stop, regenerate, edit, pin, and export.',
  'features.study.title': 'AI Study',
  'features.study.body':
    'Focused study sessions, explanations, and practice — tuned for students on the free Student plan.',
  'features.coding.title': 'AI Coding',
  'features.coding.body':
    'A real editor with model-assisted refactors, tests, and explanations — not a toy demo.',
  'features.teams.title': 'Teams',
  'features.teams.body':
    'Documents, projects, channels, and AI collaboration with fine-grained roles and automations.',
  'features.sparks.title': 'Sparks',
  'features.sparks.body':
    'One transparent wallet for AI usage. Daily top-up, clear accounting, no credit cards — ever.',
  'features.memory.title': 'Smart Memory',
  'features.memory.body':
    'Optional memory the AI suggests and you approve. Full control to edit, disable, or delete.',

  // ── How it works ──────────────────────────────────────────────────────────
  'how.title': 'Up and running in minutes',
  'how.step1.title': 'Create your account',
  'how.step1.body': 'Email, password, and you’re in. Personal plan is the default.',
  'how.step2.title': 'Pick your model',
  'how.step2.body': 'ConAI Auto routes your request, or choose a model manually.',
  'how.step3.title': 'Work your way',
  'how.step3.body': 'Chat, write, code, study — then bring it to your team.',

  // ── Plans ─────────────────────────────────────────────────────────────────
  'plans.title': 'Free means free',
  'plans.subtitle':
    'No credit cards, no payments, no buying Sparks. Every plan is designed to live on the free tier.',
  'plans.personal': 'Personal',
  'plans.student': 'Student',
  'plans.teams': 'Teams',
  'plans.enterprise': 'Enterprise',
  'plans.free': 'Free',
  'plans.contact': 'Contact us',
  'plans.perDay': '/ day',
  'plans.sparks': 'Sparks',
  'plans.storage': 'storage',
  'plans.personalBody': 'For everyday AI assistance and personal projects.',
  'plans.studentBody': 'Verified students get more room to learn — manual approval required.',
  'plans.teamsBody': 'Collaborate with documents, projects, channels, and AI together.',
  'plans.enterpriseBody': 'Custom limits and controls, configured by the platform owner.',
  'plans.feature500Sparks': '500 daily Sparks',
  'plans.feature700Sparks': '700 daily Sparks',
  'plans.feature1000Sparks': '1000 daily Sparks entitlement',
  'plans.feature500MB': '500 MB personal storage',
  'plans.feature1GB': '1 GB personal storage',
  'plans.feature2GB': '2 GB shared storage per team',
  'plans.feature30Members': 'Up to 30 members per team',
  'plans.feature5Teams': '5 teams per account',
  'plans.featureVerify': 'Manual student verification',
  'plans.featureContact': 'Limits configured by platform owner',
  'plans.mostPopular': 'Most loved',

  // ── CTA ───────────────────────────────────────────────────────────────────
  'cta.title': 'Ready when you are',
  'cta.body': 'Create your free account and open your workspace in under a minute.',

  // ── Footer ────────────────────────────────────────────────────────────────
  'footer.product': 'Product',
  'footer.company': 'Company',
  'footer.legal': 'Legal',
  'footer.privacy': 'Privacy',
  'footer.terms': 'Terms',
  'footer.guidelines': 'Community Guidelines',
  'footer.safety': 'AI Safety',
  'footer.status': 'Status',
  'footer.rights': 'All rights reserved.',

  // ── Workspace shell ───────────────────────────────────────────────────────
  'ws.home': 'Home',
  'ws.chat': 'Chat',
  'ws.study': 'Study',
  'ws.coding': 'Coding',
  'ws.writing': 'Writing',
  'ws.documents': 'Documents',
  'ws.tools': 'Tools',
  'ws.library': 'Library',
  'ws.history': 'History',
  'ws.teams': 'Teams',
  'ws.newChat': 'New chat',
  'ws.plannedPhase': 'Arrives in',
  'ws.searchPlaceholder': 'Ask ConAI anything…',

  // ── Account shell ─────────────────────────────────────────────────────────
  'acc.overview': 'Overview',
  'acc.profile': 'Profile',
  'acc.security': 'Security',
  'acc.devices': 'Devices',
  'acc.connected': 'Connected Accounts',
  'acc.plans': 'Plans',
  'acc.sparks': 'Sparks',
  'acc.referrals': 'Referrals',
  'acc.storage': 'Storage',
  'acc.memory': 'AI Memory',
  'acc.preferences': 'Preferences',
  'acc.notifications': 'Notifications',
  'acc.verification': 'Student Verification',

  // ── Preferences ───────────────────────────────────────────────────────────
  'pref.title': 'Preferences',
  'pref.description': 'These settings are saved on this device and apply immediately.',
  'pref.appearance': 'Appearance',
  'pref.fontSize': 'Font size',
  'pref.fontSizeSm': 'Small',
  'pref.fontSizeMd': 'Default',
  'pref.fontSizeLg': 'Large',
  'pref.reducedMotion': 'Reduced motion',
  'pref.reducedMotionDesc': 'Minimize animations and transitions.',
  'pref.compactMode': 'Compact mode',
  'pref.compactModeDesc': 'Tighter spacing across lists and menus.',
  'pref.collapsibleSidebar': 'Collapsible sidebar',
  'pref.language': 'Interface language',
} as const;

export type I18nKey = keyof typeof en;

/** Vietnamese dictionary — must cover every `en` key. */
export const vi: Record<I18nKey, string> = {
  'common.signin': 'Đăng nhập',
  'common.signup': 'Bắt đầu',
  'common.signupFree': 'Bắt đầu miễn phí',
  'common.back': 'Quay lại',
  'common.close': 'Đóng',
  'common.loading': 'Đang tải…',
  'common.comingSoon': 'Sắp ra mắt',
  'common.phasePlanned': 'Đã lên kế hoạch',
  'common.language': 'Ngôn ngữ',
  'common.theme': 'Giao diện',
  'common.themeLight': 'Sáng',
  'common.themeDark': 'Tối',
  'common.themeSystem': 'Hệ thống',

  'nav.product': 'Sản phẩm',
  'nav.features': 'Tính năng',
  'nav.plans': 'Gói dịch vụ',
  'nav.teams': 'Nhóm',
  'nav.trust': 'Trung tâm Tin cậy',
  'nav.status': 'Trạng thái',
  'nav.docs': 'Tài liệu',
  'nav.workspace': 'Không gian làm việc',
  'nav.account': 'Tài khoản',
  'nav.admin': 'Quản trị',

  'hero.badge': 'Không gian AI miễn phí',
  'hero.title1': 'Suy nghĩ, học tập và sáng tạo',
  'hero.title2': 'cùng không gian AI của bạn.',
  'hero.subtitle':
    'ConAI gộp trợ lý AI, công cụ học tập, tài liệu và cộng tác nhóm vào một không gian đẹp và tĩnh lặng — miễn phí để bắt đầu, không cần thẻ tín dụng.',
  'hero.ctaPrimary': 'Bắt đầu miễn phí',
  'hero.ctaSecondary': 'Xem cách hoạt động',
  'hero.note': 'Gói Personal miễn phí trọn đời · 500 Sparks mỗi ngày',

  'features.title': 'Mọi thứ bạn cần, không hơn không kém',
  'features.subtitle':
    'Năm lĩnh vực sản phẩm ghép thành một nền tảng thống nhất — tinh tế như Linear, gọn gàng như Notion.',
  'features.chat.title': 'Trò chuyện AI',
  'features.chat.body':
    'Phản hồi trực tiếp với markdown, mã nguồn và LaTeX. Dừng, tạo lại, chỉnh sửa, ghim và xuất.',
  'features.study.title': 'Học cùng AI',
  'features.study.body':
    'Phiên học tập tập trung, giải thích và luyện tập — dành cho học sinh, sinh viên với gói Student miễn phí.',
  'features.coding.title': 'Lập trình với AI',
  'features.coding.body':
    'Trình biên tập thực sự với refactors, tests và giải thích do mô hình hỗ trợ — không phải bản demo.',
  'features.teams.title': 'Nhóm',
  'features.teams.body':
    'Tài liệu, dự án, kênh và AI cộng tác với phân quyền chi tiết cùng quy tắc tự động hóa.',
  'features.sparks.title': 'Sparks',
  'features.sparks.body':
    'Một ví duy nhất, minh bạch cho mọi lượt dùng AI. Nạp đầy mỗi ngày, rõ ràng tuyệt đối — không thẻ tín dụng.',
  'features.memory.title': 'Bộ nhớ Thông minh',
  'features.memory.body':
    'Bộ nhớ tùy chọn, AI đề xuất và bạn đồng ý. Toàn quyền chỉnh sửa, tắt hoặc xóa.',

  'how.title': 'Sẵn sàng chỉ trong vài phút',
  'how.step1.title': 'Tạo tài khoản',
  'how.step1.body': 'Email và mật khẩu là xong. Gói Personal là mặc định.',
  'how.step2.title': 'Chọn mô hình',
  'how.step2.body': 'ConAI Auto tự định tuyến, hoặc bạn chọn mô hình thủ công.',
  'how.step3.title': 'Làm việc theo cách của bạn',
  'how.step3.body': 'Trò chuyện, viết, code, học — rồi mang vào nhóm của bạn.',

  'plans.title': 'Miễn phí nghĩa là miễn phí',
  'plans.subtitle':
    'Không thẻ tín dụng, không thanh toán, không mua Sparks. Mọi gói đều được thiết kế để chạy trên bản miễn phí.',
  'plans.personal': 'Personal',
  'plans.student': 'Student',
  'plans.teams': 'Teams',
  'plans.enterprise': 'Enterprise',
  'plans.free': 'Miễn phí',
  'plans.contact': 'Liên hệ',
  'plans.perDay': '/ ngày',
  'plans.sparks': 'Sparks',
  'plans.storage': 'lưu trữ',
  'plans.personalBody': 'Cho nhu cầu AI hằng ngày và dự án cá nhân.',
  'plans.studentBody':
    'Học sinh, sinh viên xác minh được thêm không gian học tập — cần duyệt thủ công.',
  'plans.teamsBody': 'Cộng tác với tài liệu, dự án, kênh và AI cùng nhau.',
  'plans.enterpriseBody': 'Giới hạn và kiểm soát tùy chỉnh, do chủ sở hữu nền tảng cấu hình.',
  'plans.feature500Sparks': '500 Sparks mỗi ngày',
  'plans.feature700Sparks': '700 Sparks mỗi ngày',
  'plans.feature1000Sparks': 'Trợ cấp 1000 Sparks mỗi ngày',
  'plans.feature500MB': '500 MB lưu trữ cá nhân',
  'plans.feature1GB': '1 GB lưu trữ cá nhân',
  'plans.feature2GB': '2 GB lưu trữ chung mỗi nhóm',
  'plans.feature30Members': 'Tối đa 30 thành viên mỗi nhóm',
  'plans.feature5Teams': '5 nhóm mỗi tài khoản',
  'plans.featureVerify': 'Xác minh sinh viên thủ công',
  'plans.featureContact': 'Giới hạn do chủ sở hữu cấu hình',
  'plans.mostPopular': 'Được yêu thích nhất',

  'cta.title': 'Sẵn sàng khi bạn sẵn sàng',
  'cta.body': 'Tạo tài khoản miễn phí và mở không gian làm việc trong chưa đầy một phút.',

  'footer.product': 'Sản phẩm',
  'footer.company': 'Công ty',
  'footer.legal': 'Pháp lý',
  'footer.privacy': 'Quyền riêng tư',
  'footer.terms': 'Điều khoản',
  'footer.guidelines': 'Quy tắc Cộng đồng',
  'footer.safety': 'An toàn AI',
  'footer.status': 'Trạng thái',
  'footer.rights': 'Bảo lưu mọi quyền.',

  'ws.home': 'Trang chủ',
  'ws.chat': 'Trò chuyện',
  'ws.study': 'Học tập',
  'ws.coding': 'Lập trình',
  'ws.writing': 'Viết lách',
  'ws.documents': 'Tài liệu',
  'ws.tools': 'Công cụ',
  'ws.library': 'Thư viện',
  'ws.history': 'Lịch sử',
  'ws.teams': 'Nhóm',
  'ws.newChat': 'Cuộc trò chuyện mới',
  'ws.plannedPhase': 'Có ở',
  'ws.searchPlaceholder': 'Hỏi ConAI bất cứ điều gì…',

  'acc.overview': 'Tổng quan',
  'acc.profile': 'Hồ sơ',
  'acc.security': 'Bảo mật',
  'acc.devices': 'Thiết bị',
  'acc.connected': 'Tài khoản liên kết',
  'acc.plans': 'Gói dịch vụ',
  'acc.sparks': 'Sparks',
  'acc.referrals': 'Giới thiệu',
  'acc.storage': 'Lưu trữ',
  'acc.memory': 'Bộ nhớ AI',
  'acc.preferences': 'Tùy chọn',
  'acc.notifications': 'Thông báo',
  'acc.verification': 'Xác minh Sinh viên',

  'pref.title': 'Tùy chọn',
  'pref.description': 'Cài đặt này được lưu trên thiết bị này và áp dụng ngay lập tức.',
  'pref.appearance': 'Giao diện',
  'pref.fontSize': 'Cỡ chữ',
  'pref.fontSizeSm': 'Nhỏ',
  'pref.fontSizeMd': 'Mặc định',
  'pref.fontSizeLg': 'Lớn',
  'pref.reducedMotion': 'Giảm chuyển động',
  'pref.reducedMotionDesc': 'Hạn chế hiệu ứng và chuyển cảnh.',
  'pref.compactMode': 'Chế độ gọn',
  'pref.compactModeDesc': 'Khoảng cách chật hơn trong danh sách và menu.',
  'pref.collapsibleSidebar': 'Thanh bên thu gọn được',
  'pref.language': 'Ngôn ngữ giao diện',
};

export const dictionaries: Record<Language, Record<I18nKey, string>> = { en, vi };
