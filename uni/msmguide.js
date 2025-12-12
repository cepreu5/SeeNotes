// Преводи за текстовете в ръководството
const guideTexts = {
    en: [
        "Mr. StickyMan", // debug text
        "<h2>Welcome!</h2><h3>I'm <b>Mr. StickyMan</b> - your guide to the world of sticky notes.</h3>",
        "<h3>✨ I’m easy to handle! Click me (or the text) to move forward — and with Ctrl+Click you can make me disappear instantly!</h3>",
        "<h3>This is a super handy button — the little window it pops up lets you tweak all sorts of useful settings!</h3>",
        "<h3>Press it and I’ll unveil secrets no one else knows — but first, let’s look 👀 around!</h3>",
        "<h3>With this slider you can resize your notes just the way you like. The window turns transparent so you can still see what’s happening underneath! Try it!</h3>",
        "<h3>Ctrl‑click on the slider snaps it to round positions — 90, 130, and so on. For fine‑tuning with pixel‑perfect precision, use this field!</h3>",
        "<h3>This icon shows that the note has an attachment. If you click it, you will see a preview in the note.</h3>",

    ],
    bg: [
        "Лепчо", // debug text
        "<h2>Добре дошли!</h2><h3>Аз съм <b>Лепчо</b> - твоят екскурзовод и помощник в света на лепящите бележки.</h3>",
        "<h3>✨ С мен се общува лесно. Ако искаш да мина на следващата стъпка, кликни на текста или върху мен. А с Ctrl+Click можеш да ме скриеш веднага.</h3>",
        "<h3>Това е един много полезен бутон - от прозорчето, което отваря може да направиш полезни настройки.</h3>",
        "<h3>Когато го натиснеш ще ти разкрия тайни, които никой не знае, но нека сега да се огледаме 👀 наоколо!</h3>",
        "<h3>С този слайдер можеш да промениш размера на бележките. Прозорецът с настройките ще стане прозрачен, така че да виждаш какво се случва под него. Пробвай го!</h3>",
        "<h3>Ctrl-click върху слайдера ще го позиционира на кръгли позиции - 90, 130, .... За фина настройка с точност един пиксел използвай това поле.</h3>",
        "<h3>Тази иконка показва, че към бележката има приложение. Ако я кликнеш, ще видиш преглед на приложението в бележката.</h3>",
    ]
};

// Получаваме текущия език от localStorage (по подразбиране 'en')
const getCurrentLanguage = () => localStorage.getItem('language') || 'en';

const steps = [
    { // debug image 
        image: "msm/r-up.png!", height: 100, target: "#search-box", textKey: 0,
        x: -70, y: 20, bx: -19, by: 175, bWidth: 93, bHeight: 50
    },
    {
        image: "msm/1.png", height: 200, target: "#lang-bg-main", textKey: 0,
        x: -360, y: 25, bx: 120, by: 46, bWidth: 171, bHeight: 118
    },
    {
        image: "msm/expl.png", height: 150, target: "#search-box", textKey: 1,
        x: 25, y: 321, bx: 80, by: -14, bWidth: 241, bHeight: 124
    },
    {
        image: "msm/l-up.png", height: 250, target: "#settings_button", textKey: 2,
        x: 3, y: 16, bx: -250, by: 96, bWidth: 215, bHeight: 91
    },
    {
        image: "msm/expl2.png!", height: 150, target: "#settings_button", textKey: 3,
        x: -154, y: 56, bx: -178, by: 41, bWidth: 230, bHeight: 75
    },
    //{
    //    image: "msm/right-up.png", height: 150, target: "#scaleSlider", textKey: 4,
    //    x: -88, y: 1, bx: 199, by: 166, bWidth: 275, bHeight: 118
    //},
    {
        image: "msm/l-up.png!", height: 100, target: "#show-datemod-checkbox", textKey: 5,
        x: 1, y: 4, bx: -260, by: 116, bWidth: 275, bHeight: 118
    },
    {
        image: "msm/l-up.png", height: 150, target: "#scaleInput", textKey: 5,
        x: 34, y: -1, bx: -260, by: 116, bWidth: 275, bHeight: 118
    },
];

