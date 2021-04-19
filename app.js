/**
 * ⚡⚡⚡ DECLARAMOS LAS LIBRERIAS y CONSTANTES A USAR! ⚡⚡⚡
 */
const fs = require('fs');
const express = require('express');
const moment = require('moment');
const ora = require('ora');
const chalk = require('chalk');
const ExcelJS = require('exceljs');
const qrcode = require('qrcode-terminal');
const qr = require('qr-image');
const { Client, MessageMedia } = require('whatsapp-web.js');
const flow = require('./flow/steps.json')
const messages = require('./flow/messages.json')
const vendors = require('./flow/vendor.json')
const products = require('./flow/products.json')
const app = express();
app.use(express.urlencoded({ extended: true }))
const SESSION_FILE_PATH = './session.json';
let client;
let sessionData;

/**
 * Enviamos archivos multimedia a nuestro cliente
 * @param {*} number 
 * @param {*} fileName 
 */
const sendMedia = (number, fileName, text = null) => {
    number = number.replace('@c.us', '');
    number = `${number}@c.us`
    const media = MessageMedia.fromFilePath(`./mediaSend/${fileName}`);
    client.sendMessage(number, media, { caption: text || null });
}

/**
 * Enviamos un mensaje simple (texto) a nuestro cliente
 * @param {*} number 
 */
const sendMessage = (number = null, text = null) => {
    number = number.replace('@c.us', '');
    number = `${number}@c.us`
    const message = text;
    client.sendMessage(number, message);
    console.log(`${chalk.red('⚡⚡⚡ Enviando mensajes....')}`);
}

/**
 * Revisamos si tenemos credenciales guardadas para inciar sessio
 * este paso evita volver a escanear el QRCODE
 */
const withSession = () => {
    const spinner = ora(`Cargando ${chalk.yellow('Validando session con Whatsapp...')}`);
    sessionData = require(SESSION_FILE_PATH);
    spinner.start();
    client = new Client({
        session: sessionData
    });

    client.on('ready', () => {
        console.log('Client is ready!');
        spinner.stop();
        connectionReady();

    });



    client.on('auth_failure', () => {
        spinner.stop();
        console.log('** Error de autentificacion vuelve a generar el QRCODE (Borrar el archivo session.json) **');
    })


    client.initialize();
}

/**
 * Generamos un QRCODE para iniciar sesion
 */
const withOutSession = () => {

    console.log(`${chalk.greenBright('🔴🔴 No tenemos session guardada, espera que se generar el QR CODE 🔴🔴')}`);

    client = new Client();
    client.on('qr', qr => {
        qrcode.generate(qr, { small: true });
        generateImage(qr)
    });

    client.on('ready', () => {
        console.log('Client is ready!');
        connectionReady();
    });

    client.on('auth_failure', () => {
        console.log('** Error de autentificacion vuelve a generar el QRCODE **');
    })


    client.on('authenticated', (session) => {
        // Guardamos credenciales de de session para usar luego
        sessionData = session;
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
            if (err) {
                console.log(err);
            }
        });
    });

    client.initialize();
}

const connectionReady = () => {

    /** Aqui escuchamos todos los mensajes que entran */
    client.on('message', async msg => {
        const { from, to, body } = msg;
        let step = await readChat(from, body)
        console.log('Paso ?', step);

        /**
         * Session de preguntas
         */

        if (flow.STEP_1.includes(body)) {

            /**
             * Aqui damos la bienvenida
             */

            console.log('STEP1', body);

            sendMessage(from, messages.STEP_1.join(''))
            return
        }

        if (flow.STEP_2.includes(body)) {

            /**
             * Aqui respondemos los prodcutos
            */
            const step2 = messages.STEP_2.join('')

            const parseLabel = Object.keys(products).map(o => {
                return products[o]['label'];
            }).join('')

            sendMessage(from, step2)
            sendMessage(from, parseLabel)
            await readChat(from, body, 'STEP_2_1')
            return
        }

        if (flow.STEP_3.includes(body)) {
            /**
             * Aqui respondemos los asesores
            */
            const step3 = messages.STEP_3.join('')
            console.log(step3)
            sendMessage(from, step3)
            await readChat(from, body, 'STEP_3_1')
            return
        }

        if (flow.STEP_4.includes(body)) {
            /**
             * Aqui respondemos gracias!
            */
            const step4 = messages.STEP_4.join('')
            console.log(step4)
            sendMessage(from, step4)
            await readChat(from, body)
            return
        }


        /***************************** FLOW (Steps) ******************************** */

        /* Seguimos el flujo de los productos */
        if (step && step.includes('STEP_2_1')) {

            /**
             * Buscar prodcuto en json
             */
            const insideText = body.toLowerCase();
            const productFind = products[insideText] || null;

            if (productFind) {

                sendMedia(
                    from,
                    productFind.main_image,
                    productFind.main_message.join('')
                )

                const stepProduct = `STEP_2_ITEM_${insideText}`.toUpperCase();
                await readChat(from, body, stepProduct)

            } else {
                sendMessage(from, messages.STEP_2_1.join(''))
                await readChat(from, body)
            }
            return
        }

        /** Seguimos mostrandole mas imagenes del producto */

        if (step && step.includes('STEP_2_ITEM_')) {

            /**
             * Buscar prodcuto en json
             */

            let getItem = step.split('STEP_2_ITEM_')
            getItem = getItem.reverse()[0] || null
            const nameItem = getItem.toLowerCase();
            const productFind = products[nameItem] || null;

            if (isNaN(parseInt(body))) {
                sendMessage(from, messages.STEP_2_1.join(''))
                await readChat(from, body)
                return
            }


            if (productFind) {
                const getAllitems = productFind.list;

                getAllitems.forEach(itemSend => {
                    sendMedia(
                        from,
                        itemSend.image,
                        itemSend.message.join('')
                    )

                })

                sendMessage(from, messages.STEP_2_2.join(''))

                await readChat(from, body)
            } else {
                sendMessage(from, messages.STEP_2_1.join(''))
                await readChat(from, body)
            }


            return
        }

        /* Seguimos el flujo de los asesores */
        if (step && step.includes('STEP_3_1')) {

            /**
             * Buscar asesor en json
             */
            const insideText = body.toLowerCase();
            const vendorFind = vendors[insideText] || null;

            if (vendorFind) {
                sendMessage(from, vendorFind.join(''))
                await readChat(from, body, 'STEP_4')
            } else {
                sendMessage(from, messages.STEP_3_1.join(''))
                await readChat(from, body)
            }
            return
        }

        /********************************** DEFAULT************************* */
        sendMessage(from, messages.ERROR.join(''))
        return

    });

}

/**
 * Guardar historial de conversacion
 * @param {*} number 
 * @param {*} message 
 */
const readChat = (number, message, step = null) => new Promise((resolve, reject) => {

    setTimeout(() => {
        number = number.replace('@c.us', '');
        number = `${number}@c.us`
        const pathExcel = `./chats/${number}.xlsx`;
        const workbook = new ExcelJS.Workbook();
        const today = moment().format('DD-MM-YYYY hh:mm')

        if (fs.existsSync(pathExcel)) {
            /**
             * Si existe el archivo de conversacion lo actualizamos
             */
            const workbook = new ExcelJS.Workbook();
            workbook.xlsx.readFile(pathExcel)
                .then(() => {
                    const worksheet = workbook.getWorksheet(1);
                    const lastRow = worksheet.lastRow;
                    let getRowInsert = worksheet.getRow(++(lastRow.number));
                    getRowInsert.getCell('A').value = today;
                    getRowInsert.getCell('B').value = message;

                    if (step) {
                        getRowInsert.getCell('C').value = step;
                    }

                    getRowInsert.commit();
                    workbook.xlsx.writeFile(pathExcel);

                    const getRowPrevStep = worksheet.getRow(lastRow.number);
                    const lastStep = getRowPrevStep.getCell('C').value
                    resolve(lastStep)
                })
                .catch((err) => {
                    console.log('ERR', err);
                    reject('error')
                })



        } else {
            /**
             * NO existe el archivo de conversacion lo creamos
             */
            const worksheet = workbook.addWorksheet('Chats');
            worksheet.columns = [
                { header: 'Fecha', key: 'number_customer' },
                { header: 'Mensajes', key: 'message' },
                { header: 'Paso', key: 'step' },
            ];

            step = step || ''

            worksheet.addRow([today, message, step]);
            workbook.xlsx.writeFile(pathExcel)
                .then(() => {
                    resolve('STEP_1')
                })
                .catch((err) => {
                    console.log('Error', err);
                    reject('error')
                });

        }
    }, 150)

});

const generateImage = (base64) => {
    let qr_svg = qr.image(base64, { type: 'svg', margin: 4 });
    qr_svg.pipe(require('fs').createWriteStream('qr-code.svg'));
    console.log('http://localhost:9000/qr');
}


/**
 * Revisamos si existe archivo con credenciales!
 */
(fs.existsSync(SESSION_FILE_PATH)) ? withSession() : withOutSession();

/** QR Link */

app.get('/qr', (req, res) => {
    res.writeHead(200, { 'content-type': 'image/svg+xml' });
    fs.createReadStream(`./qr-code.svg`).pipe(res);
})

app.listen(9000, () => {
    console.log('Server ready!');
})