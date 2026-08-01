"""Default style presets seeded for each user on first GET /api/styles."""

from typing import TypedDict

from app.models import StyleKind


class SeedStylePreset(TypedDict):
    title: str
    description: str
    category: str
    kind: StyleKind
    text: str


SEED_STYLE_PRESETS: list[SeedStylePreset] = [
    # --- Фотореализм ---
    {
        "title": "Студийная фотография",
        "description": "Четкий объект на белом фоне, студийное освещение.",
        "category": "Фотореализм",
        "kind": StyleKind.image,
        "text": (
            "Professional studio photography of {subject}, sharp focus, softbox lighting, "
            "pure white background, high contrast, commercial product shot style, 8k, sharp details."
        ),
    },
    {
        "title": "Фотореализм с размытым фоном (боке)",
        "description": "Объект в фокусе, фон сильно размыт в пятна.",
        "category": "Фотореализм",
        "kind": StyleKind.image,
        "text": (
            "Photorealistic shot of {subject}, shallow depth of field, creamy bokeh background, "
            "subject in sharp focus, DSLR photography, f/1.4 aperture, natural lighting, cinematic."
        ),
    },
    {
        "title": "Уличная фотография (шумный зернистый стиль)",
        "description": "Реалистичный снимок с зернистостью, как на пленку.",
        "category": "Фотореализм",
        "kind": StyleKind.image,
        "text": (
            "Street photography style of {subject}, grainy film texture, documentary style, "
            "natural motion blur, shot on Leica, black and white or natural colors, high ISO."
        ),
    },
    {
        "title": "Макро-съемка (крупный план)",
        "description": "Сверхдетализированный крупный план с эффектом макро.",
        "category": "Фотореализм",
        "kind": StyleKind.image,
        "text": (
            "Extreme macro photography of {subject}, incredible detailed textures, focus stacking, "
            "insect-eye view, sharp details, natural sunlight, shallow depth of field."
        ),
    },
    {
        "title": "Поляроид / Моментальная фотография",
        "description": "Снимок в стиле мгновенной печати с белой рамкой.",
        "category": "Фотореализм",
        "kind": StyleKind.image,
        "text": (
            "Polaroid instant photo of {subject}, white border, vintage faded colors, "
            "flash photography aesthetic, amateur snapshot, nostalgic mood."
        ),
    },
    # --- Кино и Эстетика ---
    {
        "title": "Блокбастер / Голливудский фильм",
        "description": "Эпический кадр из дорогого кино, теплая цветокоррекция.",
        "category": "Кино и Эстетика",
        "kind": StyleKind.image,
        "text": (
            "Cinematic movie still of {subject}, Hollywood blockbuster style, anamorphic lens, "
            "dramatic lighting, teal and orange color grading, epic atmosphere, 35mm film."
        ),
    },
    {
        "title": "Нуар / Темный детектив",
        "description": "Контрастное освещение, тени, драматизм.",
        "category": "Кино и Эстетика",
        "kind": StyleKind.image,
        "text": (
            "Film noir style of {subject}, dramatic shadows, Venetian blinds lighting, "
            "high contrast black and white, moody atmosphere, detective aesthetic."
        ),
    },
    {
        "title": "Аниме Кино (Макото Синкай / Ghibli)",
        "description": "Яркое небо, облака, детализированный фон, как в аниме.",
        "category": "Кино и Эстетика",
        "kind": StyleKind.image,
        "text": (
            "Studio Ghibli animation style of {subject}, vibrant clouds, highly detailed background, "
            "cel-shaded, beautiful bright colors, whimsical atmosphere, 2d anime art."
        ),
    },
    {
        "title": "Киберпанк / Неоновый город",
        "description": "Сцены в дождь с неоновой подсветкой.",
        "category": "Кино и Эстетика",
        "kind": StyleKind.image,
        "text": (
            "Cyberpunk style of {subject}, neon lights, rain soaked streets, "
            "pink and blue ambient lighting, futuristic city background, dystopian vibe, detailed textures."
        ),
    },
    {
        "title": "Винтажное кино 80-х",
        "description": "Эстетика VHS или старой видеопленки.",
        "category": "Кино и Эстетика",
        "kind": StyleKind.image,
        "text": (
            "Retro 1980s VHS aesthetic of {subject}, grainy video quality, scanlines, "
            "analog synthwave colors, magenta and cyan hues, old television screen effect."
        ),
    },
    # --- Живопись и Иллюстрация ---
    {
        "title": "Масляная живопись",
        "description": "Текстура мазков кисти, как у классиков.",
        "category": "Живопись и Иллюстрация",
        "kind": StyleKind.image,
        "text": (
            "Oil painting of {subject}, thick brush strokes, impasto texture, "
            "classic fine art style, reminiscent of Rembrandt, warm lighting, canvas texture."
        ),
    },
    {
        "title": "Акварель",
        "description": "Легкие, прозрачные мазки, размытые границы.",
        "category": "Живопись и Иллюстрация",
        "kind": StyleKind.image,
        "text": (
            "Watercolor painting of {subject}, soft edges, flowing pigments, wet-on-wet technique, "
            "light pastel colors, white paper background, artistic and ethereal."
        ),
    },
    {
        "title": "Детская книга / Мультяшный плоский стиль",
        "description": "Полностью мультяшный персонаж с яркими цветами.",
        "category": "Живопись и Иллюстрация",
        "kind": StyleKind.image,
        "text": (
            "Cartoon illustration of {subject}, children's book style, simple flat vector shapes, "
            "bright vibrant colors, cute character design, friendly smile, white background."
        ),
    },
    {
        "title": "Фотореализм + Мультяшные элементы (Гибрид)",
        "description": "Реалистичная текстура кожи/шерсти, но глаза и пропорции увеличены (как в мультиках).",
        "category": "Живопись и Иллюстрация",
        "kind": StyleKind.image,
        "text": (
            "Hyper-realistic texture of {subject} combined with stylized cartoon proportions, "
            "big expressive eyes, Pixar-style rendering, photorealistic fur/skin, hybrid 2D/3D style."
        ),
    },
    {
        "title": "Гравюра / Скетч (Черно-белое)",
        "description": "Рисунок карандашом или тушью на бумаге.",
        "category": "Живопись и Иллюстрация",
        "kind": StyleKind.image,
        "text": (
            "Pencil sketch of {subject}, cross-hatching shading, black and white, "
            "detailed line art, rough paper texture, traditional drawing style."
        ),
    },
    # --- Графика и 3D ---
    {
        "title": "Pixar / Disney 3D Мультфильм",
        "description": "3D-рендер с гладкой пластилиновой текстурой.",
        "category": "Графика и 3D",
        "kind": StyleKind.image,
        "text": (
            "3D Pixar animated character of {subject}, smooth rendering, plastic-like texture, "
            "bright studio lighting, cute and charming, high detail, global illumination."
        ),
    },
    {
        "title": "Стилизация под Play-Doh / Пластилин",
        "description": "Объект выглядит как вылепленный из пластилина.",
        "category": "Графика и 3D",
        "kind": StyleKind.image,
        "text": (
            "Claymation style of {subject}, stop-motion animation aesthetic, plasticine clay texture, "
            "visible fingerprints, warm colorful lighting, tactile appearance."
        ),
    },
    {
        "title": "Минимализм / 3D-иконка",
        "description": "Простая геометрическая форма, изометрический вид.",
        "category": "Графика и 3D",
        "kind": StyleKind.image,
        "text": (
            "Isometric 3D render of {subject}, minimalist geometric shapes, soft pastel colors, "
            "clean background, C4D style, sharp shadows, modern icon design."
        ),
    },
    {
        "title": "Пиксель-арт (8-bit)",
        "description": "Объект собран из крупных пикселей.",
        "category": "Графика и 3D",
        "kind": StyleKind.image,
        "text": (
            "Pixel art of {subject}, 8-bit retro video game style, blocky resolution, "
            "limited color palette, nostalgic gameboy aesthetic, grid visible."
        ),
    },
    {
        "title": "Воксель-арт (Minecraft стиль)",
        "description": "Объект из кубиков.",
        "category": "Графика и 3D",
        "kind": StyleKind.image,
        "text": (
            "Voxel art of {subject}, made of colorful cubic blocks, Minecraft inspired, "
            "isometric view, blocky textures, sandbox game aesthetic."
        ),
    },
    # --- Спецэффекты и Материалы ---
    {
        "title": "Золотая статуя",
        "description": "Объект отлит из золота с отражениями.",
        "category": "Спецэффекты и Материалы",
        "kind": StyleKind.image,
        "text": (
            "Solid gold statue of {subject}, polished metallic reflections, luxury aesthetic, "
            "dramatic spotlight, shiny surface, black background."
        ),
    },
    {
        "title": "Мраморная скульптура",
        "description": "Белая мраморная статуя на пьедестале.",
        "category": "Спецэффекты и Материалы",
        "kind": StyleKind.image,
        "text": (
            "Marble sculpture of {subject}, white stone texture, classical Greek statue style, "
            "intricate chiseled details, museum lighting, realistic stone material."
        ),
    },
    {
        "title": "Стекло / Хрусталь",
        "description": "Объект прозрачный, преломляет свет.",
        "category": "Спецэффекты и Материалы",
        "kind": StyleKind.image,
        "text": (
            "Crystal glass sculpture of {subject}, transparent, refractive index caustics, "
            "rainbow reflections, bokeh lights in background, elegant, glossy."
        ),
    },
    {
        "title": "Оригами (Бумага)",
        "description": "Объект сложен из бумаги с заметными сгибами.",
        "category": "Спецэффекты и Материалы",
        "kind": StyleKind.image,
        "text": (
            "Origami style of {subject}, folded paper, sharp creases, white craft paper, "
            "soft shadows, minimalistic, geometric folds."
        ),
    },
    {
        "title": "Светящийся неон",
        "description": "Только контуры объекта из неоновых трубок в темноте.",
        "category": "Спецэффекты и Материалы",
        "kind": StyleKind.image,
        "text": (
            "Neon sign of {subject}, glowing pink and blue tubes, dark night background, "
            "long exposure photography, blurred city lights."
        ),
    },
    # --- Стили Искусства ---
    {
        "title": "Сюрреализм (Дали)",
        "description": "Плавящиеся предметы, пустынные пейзажи, странные пропорции.",
        "category": "Стили Искусства",
        "kind": StyleKind.image,
        "text": (
            "Surrealist painting of {subject}, melting objects, dreamlike desert landscape, "
            "Salvador Dali style, absurd proportions, soft warm lighting."
        ),
    },
    {
        "title": "Поп-арт (Энди Уорхол)",
        "description": "Яркие контрастные цвета, растр (точки).",
        "category": "Стили Искусства",
        "kind": StyleKind.image,
        "text": (
            "Pop art style of {subject}, comic book halftone dots, vibrant bold colors "
            "(magenta, yellow, cyan), high contrast, Andy Warhol inspired, screen print effect."
        ),
    },
    {
        "title": "Кубизм (Пикассо)",
        "description": "Объект разбит на геометрические фрагменты.",
        "category": "Стили Искусства",
        "kind": StyleKind.image,
        "text": (
            "Cubist painting of {subject}, fragmented geometric shapes, multiple perspectives, "
            "abstract, Picasso style, earthy and vibrant tones."
        ),
    },
    {
        "title": "Импрессионизм (Моне)",
        "description": "Мягкие мазки, акцент на свете, размытые детали.",
        "category": "Стили Искусства",
        "kind": StyleKind.image,
        "text": (
            "Impressionist painting of {subject}, soft brush strokes, dappled sunlight, "
            "Claude Monet style, nature background, ethereal atmosphere."
        ),
    },
    {
        "title": "Японская гравюра (Укиё-э)",
        "description": "Плоские цвета, волны, детализированные линии.",
        "category": "Стили Искусства",
        "kind": StyleKind.image,
        "text": (
            "Japanese Ukiyo-e woodblock print of {subject}, bold outlines, flat color areas, "
            "Hokusai style, ocean waves, traditional Japanese aesthetic, ink painting."
        ),
    },
    # --- Футуризм и Научная Фантастика ---
    {
        "title": "Голограмма",
        "description": "Объект прозрачный, синий/голубой, с цифровыми линиями.",
        "category": "Футуризм и Научная Фантастика",
        "kind": StyleKind.image,
        "text": (
            "Holographic projection of {subject}, cyan blue transparent wireframe, "
            "digital interface, futuristic sci-fi, Tron aesthetic, glowing edges."
        ),
    },
    {
        "title": "Далекое будущее / Станция Звездных войн",
        "description": "Объект с индустриальной футуристичной эстетикой.",
        "category": "Футуризм и Научная Фантастика",
        "kind": StyleKind.image,
        "text": (
            "Sci-fi futuristic render of {subject}, industrial brutalist architecture, "
            "dystopian mood, cold metallic colors, dramatic volumetric fog, starship aesthetic."
        ),
    },
    # --- Специфичные форматы ---
    {
        "title": "Стикер (Скругленный край, белая обводка)",
        "description": "Четкий объект с толстой белой каймой для наклейки.",
        "category": "Специфичные форматы",
        "kind": StyleKind.image,
        "text": (
            "Sticker design of {subject}, thick white outline, flat vector, "
            "isolated on transparent background (or white), pop art colors, cartoon style."
        ),
    },
    {
        "title": "Эмодзи / Смайлик",
        "description": "Круглая иконка с плоским цветом.",
        "category": "Специфичные форматы",
        "kind": StyleKind.image,
        "text": (
            "Emoji icon of {subject}, circle frame, bright yellow background (or appropriate), "
            "flat 2D design, bold facial expression, iOS emoji style."
        ),
    },
    # --- Эстетика Материалов ---
    {
        "title": "Вязаный / Амигуруми",
        "description": "Объект выглядит связанным крючком из ниток.",
        "category": "Эстетика Материалов",
        "kind": StyleKind.image,
        "text": (
            "Amigurumi crochet of {subject}, wool yarn texture, knitted stitches, "
            "soft plush toy, warm cozy lighting, macro detail of fabric."
        ),
    },
    {
        "title": "Деревянная резьба",
        "description": "Объект вырезан из дерева.",
        "category": "Эстетика Материалов",
        "kind": StyleKind.image,
        "text": (
            "Wood carving of {subject}, natural oak wood texture, handcrafted, "
            "intricate chisel marks, warm brown tones, rustic style."
        ),
    },
    # --- Стили для ВИДЕО ---
    {
        "title": "Покадровая анимация (Stop Motion)",
        "description": "Движение с «дергающимся» эффектом.",
        "category": "Стили для ВИДЕО",
        "kind": StyleKind.video,
        "text": (
            "Stop motion video style of {subject}, choppy 12fps animation, clay models, "
            "handmade look, jerky movements, tabletop setup."
        ),
    },
    {
        "title": "Замедленная съемка (Slow-mo)",
        "description": "Плавное, текучее движение.",
        "category": "Стили для ВИДЕО",
        "kind": StyleKind.video,
        "text": (
            "High-speed slow motion video of {subject}, 120fps, fluid movement, "
            "water droplets suspending in air, elegant motion blur, cinematic rendering."
        ),
    },
    {
        "title": "Таймлапс (Ускоренное время)",
        "description": "Быстрое движение облаков или света по объекту.",
        "category": "Стили для ВИДЕО",
        "kind": StyleKind.video,
        "text": (
            "Time-lapse photography of {subject}, fast-moving clouds in background, "
            "dynamic lighting changes, motion trails, hyperlapse effect."
        ),
    },
    {
        "title": "Sora / Runway VFX стиль (Сюрреалистичное видео)",
        "description": "Объект трансформируется или течет.",
        "category": "Стили для ВИДЕО",
        "kind": StyleKind.video,
        "text": (
            "Surreal AI video generation style of {subject}, morphing textures, "
            "fluid liquid metal transitions, dreamlike motion, VFX particle effects."
        ),
    },
    # --- Движение камеры ---
    {
        "title": "Дрон-пролет (Эпический обзор)",
        "description": "Камера парит высоко в небе и совершает облет объекта.",
        "category": "Движение камеры",
        "kind": StyleKind.video,
        "text": (
            "Cinematic drone flyover shot of {subject}, sweeping aerial camera movement, "
            "bird's eye view, dramatic parallax effect, epic landscape background, "
            "4k high quality video, 24fps."
        ),
    },
    {
        "title": "Ручная камера (Эффект документалистики)",
        "description": "Съемка с рук с легкой тряской для эффекта живого репортажа.",
        "category": "Движение камеры",
        "kind": StyleKind.video,
        "text": (
            "Handheld shaky cam video of {subject}, documentary realism style, "
            "natural camera sway, jittery movement, realistic motion blur, "
            "amateur footage aesthetic, 60fps."
        ),
    },
    {
        "title": "Пуля времени (Bullet Time / 360°)",
        "description": "Время замирает, и камера медленно вращается вокруг объекта.",
        "category": "Движение камеры",
        "kind": StyleKind.video,
        "text": (
            "Bullet time 360-degree slow-motion video of {subject}, "
            "camera orbits around the subject, frozen time effect, "
            "Matrix-style cinematography, smooth rotating motion, 120fps."
        ),
    },
    {
        "title": "Эффект Вертиго (Dolly Zoom)",
        "description": "Объект остается в центре, а задний фон сжимается или расширяется.",
        "category": "Движение камеры",
        "kind": StyleKind.video,
        "text": (
            "Vertigo dolly zoom video effect on {subject}, background scales dramatically, "
            "subject stays fixed in frame, Hitchcock style, disorienting perspective shift, "
            "smooth continuous zoom."
        ),
    },
    {
        "title": "Следящий план сзади (Steadicam)",
        "description": "Камера плавно следует за объектом сзади или сбоку.",
        "category": "Движение камеры",
        "kind": StyleKind.video,
        "text": (
            "Steadicam tracking shot following {subject}, smooth gliding camera movement, "
            "third-person perspective, cinematic walk cycle, shallow depth of field, "
            "24fps film grain."
        ),
    },
    # --- Физика и Трансформация ---
    {
        "title": "Тающая восковая фигура",
        "description": "Объект медленно плавится, как свеча, растекаясь лужицей.",
        "category": "Физика и Трансформация",
        "kind": StyleKind.video,
        "text": (
            "Melting wax simulation video of {subject}, slow dripping motion, "
            "viscous liquid physics, subject collapses into a puddle, "
            "warm candle lighting, thermal effect, 30fps."
        ),
    },
    {
        "title": "Цветение и Рост (Таймлапс природы)",
        "description": "Объект прорастает ветвями, листьями или цветами за секунды.",
        "category": "Физика и Трансформация",
        "kind": StyleKind.video,
        "text": (
            "Organic blooming time-lapse of {subject}, branches and leaves sprouting rapidly, "
            "growing vines, botanical evolution, bioluminescent particles, vibrant colors, 25fps."
        ),
    },
    {
        "title": "Пульсирующая жизнь (Дыхание)",
        "description": "Объект слегка расширяется и сужается в такт дыханию или сердцебиению.",
        "category": "Физика и Трансформация",
        "kind": StyleKind.video,
        "text": (
            "Breathing pulsating animation of {subject}, gentle rhythmic inflation and deflation, "
            "heartbeat sync, living organism effect, subtle organic motion, glowing aura, seamless loop."
        ),
    },
    {
        "title": "Симуляция жидкости / Дым",
        "description": "Объект окутан клубящимся дымом или жидкостью, которая стекает по нему.",
        "category": "Физика и Трансформация",
        "kind": StyleKind.video,
        "text": (
            "Fluid dynamics simulation around {subject}, swirling smoke and flowing water, "
            "particle-based liquid physics, dynamic vortex motion, ethereal mist, high viscosity effect."
        ),
    },
    {
        "title": "Распад на частицы (Пыль / Светлячки)",
        "description": "Объект внезапно рассыпается на тысячи светящихся частиц.",
        "category": "Физика и Трансформация",
        "kind": StyleKind.video,
        "text": (
            "Particle disintegration effect on {subject}, subject explodes into thousands of "
            "floating dust motes and sparkles, magical fading away, soft glowing particles, "
            "reverse reconstruction loop, 60fps."
        ),
    },
    # --- Визуальные видео-эффекты ---
    {
        "title": "Глитч-арт / Сбой цифрового сигнала",
        "description": "Картинка «рвется» по горизонтали, сбиваются пиксели, как на старом ТВ.",
        "category": "Визуальные видео-эффекты",
        "kind": StyleKind.video,
        "text": (
            "Digital glitch art video of {subject}, screen tearing, VHS tracking errors, "
            "RGB split chromatic aberration, pixelation and data corruption, "
            "retro CRT monitor aesthetic, loopable."
        ),
    },
    {
        "title": "Световой след / Трейлы",
        "description": "За движущимся объектом тянется длинный шлейф света.",
        "category": "Визуальные видео-эффекты",
        "kind": StyleKind.video,
        "text": (
            "Light trail motion blur video of {subject}, neon streaks following the movement, "
            "long exposure photography style in video, dynamic ghosting effect, "
            "cyberpunk night vibe, 30fps."
        ),
    },
    {
        "title": "Переход «Пластилин» (Morphing)",
        "description": "Объект плавно перетекает в другую форму или деформируется.",
        "category": "Визуальные видео-эффекты",
        "kind": StyleKind.video,
        "text": (
            "Smooth morphing liquid metal transition of {subject}, shape-shifting transformation, "
            "flowing mercury texture, surreal AI video style, seamless metamorphosis, 24fps."
        ),
    },
    {
        "title": "Эффект «Отражения в воде»",
        "description": "Видео стилизовано под рябь на водной поверхности.",
        "category": "Визуальные видео-эффекты",
        "kind": StyleKind.video,
        "text": (
            "Water ripple reflection video effect on {subject}, caustic light rays, "
            "surface distortion waves, underwater shimmer, liquid glass refraction, "
            "gentle undulating movement."
        ),
    },
    # --- Анимационные стили для видео ---
    {
        "title": "Ротоскопия (Обводка по видео)",
        "description": "Видео обведено черными контурами, как будто нарисовано поверх в реальном времени.",
        "category": "Анимационные стили для видео",
        "kind": StyleKind.video,
        "text": (
            "Rotoscope animation video of {subject}, hand-drawn black outlines over live-action footage, "
            "sketchy line art, moving pencil strokes, creative cartoon filter, 12fps."
        ),
    },
    {
        "title": "Бумажная перекладная анимация (Коллаж)",
        "description": "Объект выглядит как вырезанный из бумаги и двигается рывками.",
        "category": "Анимационные стили для видео",
        "kind": StyleKind.video,
        "text": (
            "Paper cutout stop-motion collage of {subject}, 2D flat paper layers moving independently, "
            "shadow puppetry, cut-and-paste animation style, textured cardboard background, 8fps."
        ),
    },
    {
        "title": "Сакуга / Динамичное Аниме",
        "description": "Очень плавная, преувеличенная анимация с искажениями лиц и ветром.",
        "category": "Анимационные стили для видео",
        "kind": StyleKind.video,
        "text": (
            "Sakuga anime animation style of {subject}, extremely smooth high-frame-rate 2D motion, "
            "exaggerated action lines, dynamic wind and impact frames, vibrant cel-shaded colors, 60fps."
        ),
    },
    {
        "title": "Кинетическая типографика / Танцующая геометрия",
        "description": "Объект вибрирует и двигается в такт музыке/ритму.",
        "category": "Анимационные стили для видео",
        "kind": StyleKind.video,
        "text": (
            "Kinetic rhythmic motion video of {subject}, object bounces and sways to a beat, "
            "energetic dance movement, synthwave aesthetic, hypnotic loop, reactive pulsation."
        ),
    },
    # --- Специфические жанры и FPV ---
    {
        "title": "Гиперлапс (Движение во времени)",
        "description": "Камера стремительно летит вперед, а время вокруг ускорено.",
        "category": "Специфические жанры и FPV",
        "kind": StyleKind.video,
        "text": (
            "Hyperlapse video traveling past {subject}, fast-paced forward motion, "
            "streaking city lights, accelerated time flow, dynamic perspective warp, "
            "speed-ramping effect, 30fps."
        ),
    },
    {
        "title": "FPV-экшн (Вид от первого лица)",
        "description": "Иммерсивное видео от первого лица с резкими маневрами.",
        "category": "Специфические жанры и FPV",
        "kind": StyleKind.video,
        "text": (
            "First-person view (FPV) drone racing video of {subject}, immersive cockpit perspective, "
            "rapid agile maneuvers, fast tilting and banking, high-octane action, "
            "wide-angle fisheye lens, 60fps."
        ),
    },
    # --- Бонусные ---
    {
        "title": "Цепная реакция (Домино)",
        "description": "Объекты сталкиваются и падают друг за другом, создавая волну.",
        "category": "Бонусные видео-сценарии",
        "kind": StyleKind.video,
        "text": (
            "Chain reaction domino effect video featuring {subject}, sequential collisions, "
            "physical impact simulation, bouncing and sliding mechanics, "
            "Rube Goldberg machine style, 24fps."
        ),
    },
    {
        "title": "Покадровая замена / Трансформация цвета",
        "description": "Цвет объекта переливается радугой или одежда меняется за долю секунды.",
        "category": "Бонусные видео-сценарии",
        "kind": StyleKind.video,
        "text": (
            "Color cycling and outfit morphing video of {subject}, rapid palette swapping, "
            "iridescent rainbow shift, magical girl transformation sequence, "
            "sparkling transition effects, 30fps."
        ),
    },
]
