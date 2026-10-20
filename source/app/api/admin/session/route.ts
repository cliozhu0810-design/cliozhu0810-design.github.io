import {json,isAdmin} from '../../../../lib/comments';
export async function GET(request:Request){return json({admin:isAdmin(request)});}
