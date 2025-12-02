// Преводи за текстовете в ръководството
const guideTexts = {
    en: [
        "<h2>Welcome!</h2><h3>I'm <b>Mr. StickyMan</b> - your guide to the world of sticky notes.</h3>",
        "Here you can add new notes.",
        "And here you will see the statistics.",
        "<h3>This icon shows that the note has an attachment. If you click it, you will see a preview in the note.</h3>",
        "<h3>I like this kind of Shoping list.</h3>",

    ],
    bg: [
        "<h2>Добре дошли!</h2><h3>Аз съм <b>Лепчо</b> - вашият екскурзовод в света на лепящите бележки.</h3>",
        "Тук можеш да добавиш нови записи.",
        "А тук ще видиш статистиката.",
        "<h3>Тази иконка показва, че към бележката има приложение. Ако я кликнеш, ще видиш преглед на приложението в бележката.</h3>",
        "<h3>Аз харесвам такива списъци.</h3>"
    ]
};

// Получаваме текущия език от localStorage (по подразбиране 'en')
const getCurrentLanguage = () => localStorage.getItem('language') || 'en';

const steps = [
    {
        image: "msm/1.png", height: 200, target: "#lang-bg-main", textKey: 0,
        x: -360, y: 25, bx: 120, by: 46, bWidth: 171, bHeight: 118
    },
    {
        image: "msm/right-up.png", height: 150, target: "#lang-bg-main", textKey: 1,
        x: -269, y: 341, bx: 149, by: 50, bWidth: 300, bHeight: 150
    },
    {
        image: "msm/right-up.png", height: 150, target: "#lang-bg-main", textKey: 2,
        x: -198, y: 27, bx: 173, by: 47, bWidth: 300, bHeight: 150
    },
    {
        image: "msm/right-up.png", height: 150, target: "#search-box", textKey: 3,
        x: -201, y: 292, bx: 80, by: -14, bWidth: 300, bHeight: 150
    },
    {
        image: "msm/right-up.png", height: 150, target: "#search-box", textKey: 4,
        x: 367, y: 233, bx: -44, by: 29, bWidth: 141, bHeight: 50
    },
];

