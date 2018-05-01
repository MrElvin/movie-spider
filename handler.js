const rp = require('request-promise')
const cheerio = require('cheerio')
const ProgressBar = require('progress')
const chalk = require('chalk')
const fs = require('fs')
const path = require('path')

const DEFAULT_COUNT = 50

const URL = {
  IMDB: `https://api.douban.com/v2/movie/top250`,
  SHOW_THEATERS: `https://api.douban.com/v2/movie/in_theaters?count=${DEFAULT_COUNT}`,
  COMING_SOON: `https://api.douban.com/v2/movie/coming_soon?count=${DEFAULT_COUNT}`,
  MOVIE: `https://movie.douban.com/subject/`,
  SUMMARY: `https://movie.douban.com/ithil_j/activity/movie_annual`,
  SEARCH: `https://api.douban.com/v2/movie/search?q=`
}

const bar = new ProgressBar(`进度 [:bar] ${chalk.yellowBright(':percent')}${chalk.yellow(' / :total%')} ${chalk.yellow(':info')} `, {
  complete: '=',
  incomplete: ' ',
  head: '>',
  total: 100,
  width: 100,
  clear: true
})

const show = async (ctx) => {
  bar.tick(10, { info: '获取豆瓣网接口数据...' })
  const response = await rp(`${ctx.soon ? URL.COMING_SOON : URL.SHOW_THEATERS}`)
  bar.tick(10, { info: '获取豆瓣网接口数据成功' })
  bar.tick(5, { info: '筛选高评分电影...' })
  const moviesInTheaterOriginal = JSON.parse(response).subjects.map(movie => {
    const { genres, title, original_title, alt, id } = movie
    return {
      average_rating: movie.rating.average,
      genres: genres.join(' / '),
      title,
      original_title,
      alt,
      id,
      image: movie.images.medium
    }
  })
  const moviesInTheater = moviesInTheaterOriginal.filter(movie => { return (Number(movie.average_rating) >= 6) })
  bar.tick(5, { info: '筛选高评分电影成功' })
  const htmlPromises = moviesInTheater.map(async movie => await rp(movie.alt))
  bar.tick(10, { info: '获取每部高评分电影详细信息...' })
  for (let index = 0; index < htmlPromises.length; index++) {
    const htmlString = await htmlPromises[index]
    let $ = cheerio.load(htmlString)
    const actors = $('span.actor .attrs').text()
    const directors = $('a[rel="v:directedBy"]').text()
    const releaseDate = $('span[property="v:initialReleaseDate"]').text()
    const runtime = $('span[property="v:runtime"]').text()
    const buyLink = ctx.soon ? '' : decodeURIComponent($('a.ticket-btn').attr('href').split('url=')[1])
    const summary = $('span[property="v:summary"]').text().split('\n').map(string => string.trim()).filter(string => string !== '')
    const roleList = Array.from($('.celebrities-list .celebrity').map((index, celebrity) => {
      return {
        name: $(celebrity).find('span.name').text(),
        role: $(celebrity).find('span.role').text()
      }
    }))
    if (!ctx.soon) {
      try {
        const commentHtmlString = await rp(`${URL.MOVIE}${moviesInTheater[index].id}/comments`)
        $ = cheerio.load(commentHtmlString)
        const comments = Array.from($('.comment-item').map((index, comment) => {
          return {
            commentTime: $(comment).find('span.comment-time').text().replace(/^\s+|\s+$/g, ''),
            commentUser: $(comment).find('span.comment-info a').text(),
            commentDetail: $(comment).find('div.comment p').text().replace(/^\s+|\s+$/g, ''),
            commentVote: $(comment).find('.comment-vote span.votes').text().replace(/^\s+|\s+$/g, '')
          }
        })).slice(0, 10)
        Object.assign(moviesInTheater[index], { actors, directors, releaseDate, runtime, buyLink, summary, roleList, comments })
      } catch (err) {
        continue;
      }
    }
    Object.assign(moviesInTheater[index], { actors, directors, releaseDate, runtime, buyLink, summary, roleList })
    bar.tick(Math.ceil(40 / htmlPromises.length))
  }
  bar.tick(5, { info: '格式化内容...' })
  const print = moviesInTheater.map(movie => {
    if (ctx.parent.file) {
      return `![${movie.title}](${movie.image})\n### ${movie.title}           ${movie.average_rating}\n##### ${movie.original_title}\n- 导演： ${movie.directors !== '' ? movie.directors : '暂无信息'}\n- 主演： ${movie.actors !== '' ? movie.actors : '暂无信息'}\n- 类型： ${movie.genres}\n- 上映日期： ${movie.releaseDate !== '' ? movie.releaseDate.replace(/\)/g, '\) ') : '暂无信息'}\n- 影片时长： ${movie.runtime !== '' ? movie.runtime : '暂无信息'}\n- 剧情简介：${movie.summary ? '\n' + movie.summary.join('\n') : '暂无信息'}\n- 演职员表：${movie.roleList ? '\n' + movie.roleList.filter(role => role.role !== '').map((role, index) => `  - **${role.name}**    ${role.role}\n\n`).join('') : '暂无信息'}\n${ctx.now ? `- 网友热评：${movie.comments !== undefined ? '\n' + movie.comments.map((comment, index) => `> **${index + 1}   ${comment.commentUser}**         ${comment.commentTime}        ${comment.commentVote}\n> ${comment.commentDetail}\n\n`).join('') : '暂无评论'}` : ''}\n${ctx.soon ? '' : `- 购票链接： [${movie.title}](${movie.buyLink})`}`
    }
    return `
      ${chalk.bold.keyword('wheat')('标   题')} - ${chalk.bold.keyword('skyblue')(movie.title)} ${chalk.bold.keyword('skyblue')(movie.original_title)}
      ${chalk.bold.keyword('wheat')('评   分')} - ${chalk.bold.keyword('skyblue')(movie.average_rating)}
      ${chalk.bold.keyword('wheat')('题   材')} - ${chalk.bold.keyword('skyblue')(movie.genres)}
      ${chalk.bold.keyword('wheat')('演职员表')}\n      ${chalk.bold.keyword('skyblue')(movie.roleList ? movie.roleList.filter(role => role.role !== '').map((role, index) => `  ${chalk.white('-')} ${role.name}    ${role.role}`).join(`\n      `) : '暂无信息')}
      ${chalk.bold.keyword('wheat')('上映日期')} - ${chalk.bold.keyword('skyblue')(movie.releaseDate.replace(/\)/g, '\) '))}
      ${chalk.bold.keyword('wheat')('影片时长')} - ${chalk.bold.keyword('skyblue')(movie.runtime !== '' ? movie.runtime : '暂无信息')}
      ${chalk.bold.keyword('wheat')('剧情简介')}\n        - ${chalk.bold.keyword('skyblue')(movie.summary ? movie.summary.join('\n') : '暂无信息')}
      ${ctx.soon ? '' : `${chalk.bold.keyword('wheat')('购票链接')} - ${chalk.bold.keyword('skyblue')(movie.buyLink)}`}
      `
  })
  bar.tick(5, { info: '格式化内容成功，准备写入' })
  if (ctx.parent.file) {
    return fs.writeFile(ctx.parent.file, print.join('\n\n'), 'utf-8', (err) => {
      if (err) throw err
      else {
        bar.tick(10, { info: '内容写入成功' })
        console.log(`数据已经输出在 ${chalk.underline.bold.red(path.resolve(process.cwd(), ctx.parent.file))}`)
      }
    })
  } else {
    bar.tick(10, { info: '内容写入成功' })
    print.forEach(item => {
      console.log(item)
      console.log('')
    })
  }
}

const imdb = async (count = DEFAULT_COUNT, start, ctx) => {
  const times = Math.ceil(count / 100)
  const orginStart = Number(start)
  const imdbMovies = []
  bar.tick(10, { info: '获取 IMDB 数据...' })
  while (count >= 0) {
    const jsonString = await rp(`${URL.IMDB}?start=${start}&count=${count}`)
    bar.tick(Math.ceil(40 / times))
    imdbMovies.push(...JSON.parse(jsonString).subjects)
    start += 100
    count -= 100
  }
  bar.tick(10, { info: '加工 IMDB 数据...' })
  const imdbInfo = imdbMovies.map((movie, index) => {
    const { genres, title, original_title, year } = movie
    return {
      average_rating: movie.rating.average,
      image: movie.images.length === 0 ? null : movie.images.medium,
      rank: orginStart + index + 1,
      genres,
      title,
      original_title,
      year,
      directors: movie.directors.map(director => { return director.name }),
      casts: movie.casts.map(cast => { return cast.name })
    }
  })
  bar.tick(20, { info: '加工 IMDB 数据完毕' })
  bar.tick(10, { info: '转换 IMDB 数据...' })
  const print = imdbInfo.map(movie => {
    if (ctx.parent.file) {
      return `### ${movie.rank}  ${movie.title}   ${movie.original_title}\n![${movie.title}](${movie.image})\n- **评 分：** ${movie.average_rating}\n- **年 份：** ${movie.year}\n- **题 材：** ${movie.genres.join('  ')}\n- **导 演：** ${movie.directors.join('  ')}\n- **演 员：** ${movie.casts.join('  ')}\n\n\n\n`
    }
    return `
      ${chalk.bold.keyword('wheat')('IMDB 排名')} - ${chalk.bold.keyword('skyblue')(movie.rank)}
        ${chalk.bold.keyword('wheat')('标   题')} - ${chalk.bold.keyword('skyblue')(movie.title)} ${chalk.bold.keyword('skyblue')(movie.original_title)}
        ${chalk.bold.keyword('wheat')('年   份')} - ${chalk.bold.keyword('skyblue')(movie.year)}
        ${chalk.bold.keyword('wheat')('评   分')} - ${chalk.bold.keyword('skyblue')(movie.average_rating)}
        ${chalk.bold.keyword('wheat')('题   材')} - ${chalk.bold.keyword('skyblue')(movie.genres.join('  '))}
        ${chalk.bold.keyword('wheat')('封   面')} - ${chalk.bold.keyword('skyblue')(movie.image)}
        ${chalk.bold.keyword('wheat')('导   演')} - ${chalk.bold.keyword('skyblue')(movie.directors.join('  '))}
        ${chalk.bold.keyword('wheat')('演   员')} - ${chalk.bold.keyword('skyblue')(movie.casts.join('  '))}
    `
  })
  if (ctx.parent.file) {
    return fs.writeFile(ctx.parent.file, print.join('\n\n'), 'utf-8', (err) => {
      if (err) throw err
      else bar.tick(10, { info: '转换 IMDB 数据完毕，已输出到文件中' })
      console.log(`数据已经输出在 ${chalk.underline.bold.red(path.resolve(process.cwd(), ctx.parent.file))}`)
    })
  }
  bar.tick(10, { info: '转换 IMDB 数据完毕，准备打印...' })
  print.forEach(item => {
    console.log(item)
    console.log('')
  })
}

const summary = async (year, ctx) => {
  if (year < 2016 || year >= (new Date()).getFullYear()) return console.log(chalk.keyword('wheat')(`目前只支持查询 2016 年 - ${(new Date()).getFullYear() - 1} 年`))
  bar.tick(10, { info: '查询总结内容项目数...' })
  const summaryTotalInfo = JSON.parse(await rp(`${URL.SUMMARY}${year}`))
  const summaryNavList = summaryTotalInfo.res.widget_infos.slice(1, -2)
  bar.tick(10, { info: '查询项目数成功' })
  const summaryDialogueArr = []
  const summaryTop10Arr = []
  const summaryPeopleArr = []
  const summaryListPromises = summaryNavList.map(async (summaryItem, index) => await rp(`${URL.SUMMARY}${year}/widget/${index + 1}`))
  bar.tick(10, { info: '获取每个总结项目信息...' })
  for (let index = 0; index < summaryListPromises.length; index++) {
    const summaryItem = JSON.parse(await summaryListPromises[index]).res
    bar.tick(50 / summaryListPromises.length)
    const summaryItemInfo = {}
    if (summaryItem.kind_str === 'dialogue') {
      summaryItemInfo.type = 'dialogue'
      summaryItemInfo.text = summaryItem.payload.text
      summaryItemInfo.movieTitle = summaryItem.subject.title
      summaryItemInfo.orig_title = summaryItem.subject.orig_title
      summaryItemInfo.rating = summaryItem.subject.rating
      summaryDialogueArr.push(summaryItemInfo)
    } else if (summaryItem.kind_str === 'person') {
      summaryItemInfo.type = 'person'
      summaryItemInfo.summaryTitle = summaryItem.payload.title.replace(/\|/g, '')
      summaryItemInfo.people = summaryItem.people
      summaryPeopleArr.push(summaryItemInfo)
    } else if (summaryItem.kind_str === 'top10') {
      summaryItemInfo.type = 'top10'
      summaryItemInfo.summaryTitle = summaryItem.payload.title.replace(/\|/g, '')
      summaryItemInfo.movies = summaryItem.subjects
      summaryTop10Arr.push(summaryItemInfo)
    }
  }
  bar.tick(5, { info: '处理每个总结项目信息...' })
  const printDialogue = summaryDialogueArr.map(summaryItem => {
    if (ctx.parent.file) {
      return `\n- ${summaryItem.text}\n     ----  **${summaryItem.movieTitle}**    ${summaryItem.orig_title ? '*' + summaryItem.orig_title + '*' : ''}  **${summaryItem.rating}**\n\n`
    }
    return `
      ${chalk.keyword('wheat')(summaryItem.text.replace(/^\s+|\s+$/g, ''),)}\n                            ---- ${chalk.italic.keyword('lightsteelblue')(summaryItem.movieTitle)}   ${chalk.italic.keyword('lightsteelblue')(summaryItem.orig_title ? summaryItem.orig_title : '')}   ${chalk.bold.keyword('lightsalmon')(summaryItem.rating)}
    `
  })
  const printPeople = summaryPeopleArr.map(summaryItem => {
    if (ctx.parent.file) {
      return `\n#### ${summaryItem.summaryTitle}\n${summaryItem.people.map(person => { return `- ${person.name}    *${person.name_en}*\n` }).join('')}`
    }
    return `
      ${chalk.keyword('lightsalmon')(summaryItem.summaryTitle)}
      ${summaryItem.people.map(person => { return `\n        ${chalk.keyword('wheat')(person.name)}    ${chalk.italic.keyword('wheat')(person.name_en)}` }).join('')}
    `
  })
  const printTop10 = summaryTop10Arr.map(summaryItem => {
    if (ctx.parent.file) {
      return `\n#### ${summaryItem.summaryTitle}\n${summaryItem.movies.map(movie => { return `- **${movie.title}**    ${movie.orig_title ? '*' + movie.orig_title + '*' : ''}   **${movie.rating}**\n` }).join('')}`
    }
    return `
      ${chalk.keyword('lightsalmon')(summaryItem.summaryTitle)}
      ${summaryItem.movies.map(movie => { return `\n        ${chalk.keyword('wheat')(movie.title)}    ${chalk.italic.keyword('wheat')(movie.orig_title ? movie.orig_title : '')}   ${chalk.italic.keyword('lightcoral')(movie.rating)}` }).join('')}
    `
  })
  bar.tick(5, { info: '处理每个总结项目信息...' })
  if (ctx.parent.file) {
    fs.writeFile(ctx.parent.file, `## 排行榜：\n${printTop10.join('')}\n\n## 台词：\n${printDialogue.join('')}\n\n## 明星：\n${printPeople.join('')}`, 'utf-8', (err) => {
      if (err) throw err
      else bar.tick(10, { info: '转换年度总结数据完毕，已输出到文件中' })
      console.log(`数据已经输出在 ${chalk.underline.bold.red(path.resolve(process.cwd(), ctx.parent.file))}`)
    })
  } else {
    bar.tick(10, { info: '转换年度总结数据完毕，已输出到文件中' })
    console.log(`
      ${chalk.bold.keyword('lightsalmon')('排行榜：')}
      ${printTop10.join('')}
      ${chalk.bold.keyword('lightsalmon')('台词：')}
      ${printDialogue.join('')}
      ${chalk.bold.keyword('lightsalmon')('明星：')}
      ${printPeople.join('')}
    `)
  }
}

const search = async (query, ctx) => {
  if (ctx.movie) {
    searchMovie(ctx.movie)
  } else if (ctx.star) {
    searchStar(ctx.star)
  } else {
    searchMovie(query)
  }
}

const searchMovie = async (movie) => {
  bar.tick(20, { info: '正在查询...' })
  const result = JSON.parse(await rp(`${URL.SEARCH}${encodeURIComponent(movie)}`))
  const movieSearched = result.subjects.length !== 0 ? result.subjects[0] : null
  if (!movieSearched) {
    bar.tick(80, { info: '查询失败...' })
    return console.log(chalk.keyword('wheat')('查无此结果，请精确输入'))
  }
  bar.tick(30, { info: '查询成功' })
  bar.tick(10, { info: '获取具体信息...' })
  const movieHTMLString = await rp(movieSearched.alt)
  const $ = cheerio.load(movieHTMLString)
  const actors = $('span.actor .attrs').text()
  const directors = $('a[rel="v:directedBy"]').text()
  const releaseDate = $('span[property="v:initialReleaseDate"]').text() ? $('span[property="v:initialReleaseDate"]').text() : ''
  const runtime = $('span[property="v:runtime"]').text() ? $('span[property="v:runtime"]').text() : ''
  const summary = $('span[property="v:summary"]').text().split('\n').map(string => string.trim()).filter(string => string !== '')
  const roleList = Array.from($('.celebrities-list .celebrity').map((index, celebrity) => {
    return {
      name: $(celebrity).find('span.name').text().replace(/^\s+|\s+$/g, ''),
      role: $(celebrity).find('span.role').text().replace(/^\s+|\s+$/g, '')
    }
  }))
  const resultMovie = Object.assign(movieSearched, { actors, directors, releaseDate, runtime, summary, roleList })
  bar.tick(20, { info: '获取具体信息成功' })
  bar.tick(10, { info: '拼接展示文本...' })
  const print =`
    ${chalk.bold.keyword('wheat')('标   题')} - ${chalk.bold.keyword('skyblue')(resultMovie.title)} ${chalk.italic.bold.keyword('skyblue')(resultMovie.original_title)}
    ${chalk.bold.keyword('wheat')('评   分')} - ${chalk.bold.keyword('skyblue')(resultMovie.rating.average)}
    ${chalk.bold.keyword('wheat')('题   材')} - ${chalk.bold.keyword('skyblue')(resultMovie.genres.join(' / '))}
    ${chalk.bold.keyword('wheat')('演职员表')}\n      ${chalk.bold.keyword('skyblue')(resultMovie.roleList ? resultMovie.roleList.filter(role => role.role !== '').map((role, index) => `  ${chalk.white('-')} ${role.name}    ${role.role}`).join(`\n      `) : '暂无信息')}
    ${chalk.bold.keyword('wheat')('上映日期')} - ${chalk.bold.keyword('skyblue')(resultMovie.releaseDate ? resultMovie.releaseDate.replace(/\)/g, '\) ') : '暂无信息')}
    ${chalk.bold.keyword('wheat')('影片时长')} - ${chalk.bold.keyword('skyblue')(resultMovie.runtime !== '' ? resultMovie.runtime : '暂无信息')}
    ${chalk.bold.keyword('wheat')('剧情简介')}\n        ${chalk.bold.keyword('skyblue')(resultMovie.summary ? resultMovie.summary.join('\n        ') : '暂无信息')}
    ${chalk.bold.keyword('wheat')('豆瓣链接')} - ${chalk.bold.keyword('skyblue')(resultMovie.alt)}
  `
  bar.tick(10, { info: '拼接完毕' })
  console.log(print)
}

const searchStar = async (star) => {
  bar.tick(20, { info: '正在查询...' })
  const result = JSON.parse(await rp(`${URL.SEARCH}${encodeURIComponent(star)}`))
  const starSearchedItem = result.subjects.length !== 0 ? result.subjects[0] : null
  if (!starSearchedItem) {
    bar.tick(80, { info: '查询失败...' })
    return console.log(chalk.keyword('wheat')('查无此结果，请精确输入'))
  }
  // 遍历 casts 和 directors 找到链接
  let starURL = ''
  const tempArr = [...starSearchedItem.casts, ...starSearchedItem.directors]
  tempArr.forEach(item => {
    if (item.name === star) {
      return starURL = item.alt
    }
  })
  if (!starURL) {
    bar.tick(80, { info: '查询失败...' })
    return console.log(chalk.keyword('wheat')('查无此结果，请精确输入'))
  }
  bar.tick(30, { info: '查询成功' })
  bar.tick(10, { info: '获取具体信息...' })
  // 抓取具体
  const starHTMLString = await rp(starURL)
  const $ = cheerio.load(starHTMLString)
  const name = $('#content h1').text()
  const infoArr = $('#headline .info ul').text().split('\n').filter(item => item.trim() !== '').map(item => item.replace(/^\s+|\s+$/g, ''))
  const infoResults = []
  infoArr.forEach((info, index) => {
    if (index % 2 === 0) {
      infoResults.push({ key: info })
    } else {
      infoResults[Math.floor(index / 2)].value = info
    }
  })
  const infoPrint = infoResults.map((info, index) => index === 0 ? `${info.key}    ${info.value}\n` : `        ${info.key}    ${info.value}\n`).join('')
  const introduction = $('#intro .bd').text().replace(/^\s+|\s+$/g, '').split(/\s+|\s+/g)
  const top5 = $('#best_movies .bd').text().split('\n').filter(item => item.trim() !== '').map(item => item.replace(/^\s+|\s+$/g, ''))
  const top5Arr = []
  top5.forEach((info, index) => {
    if (index % 3 === 0) {
      top5Arr.push({ name: info })
    }
    if (index % 3 === 1) {
      top5Arr[Math.floor(index / 3)].rating = info
    }
    if (index % 3 === 2) {
      top5Arr[Math.floor(index / 3)].year = info
    }
  })
  const top5Print = top5Arr.map((top, index) => index === 0 ? `${top.name}   ${top.rating}   ${top.year}\n` : `        ${top.name}   ${top.rating}   ${top.year}\n`).join('')
  bar.tick(20, { info: '获取具体信息成功' })
  bar.tick(10, { info: '拼接展示文本...' })
  const print =`
    ${chalk.bold.keyword('lightsalmon')(name)}\n
      ${chalk.bold.keyword('wheat')('基本信息：')}\n
        ${infoPrint}
      ${chalk.bold.keyword('wheat')('个人简介')}\n
        ${introduction.join('\n        ')}\n
      ${chalk.bold.keyword('wheat')('最佳作品：')}\n
        ${top5Print}
  `
  bar.tick(10, { info: '拼接完毕' })
  console.log(print)
}

exports.show = show
exports.imdb = imdb
exports.summary = summary
exports.search = search
